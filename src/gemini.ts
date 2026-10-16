import { z } from "zod";
import { config, requireKeys } from "./config.js";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string; status: string; details?: unknown[] };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Free-tier limits are per model, so when one model is out of quota or overloaded
 * we move on to the next. The model that last worked is tried first.
 */
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
let preferred: string | null = null;
const modelOrder = () => [...new Set([preferred, config.gemini.model, ...FALLBACK_MODELS].filter((m): m is string => Boolean(m)))];

async function callModel(model: string, body: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": config.gemini.apiKey },
    body,
    signal: AbortSignal.timeout(600_000),
  });
  const raw = await res.text();
  let data: GeminiResponse = {};
  try {
    data = JSON.parse(raw) as GeminiResponse;
  } catch {
    data = { error: { code: res.status, message: raw.slice(0, 200), status: res.statusText } };
  }
  return { res, data };
}

async function generate(system: string, prompt: string, generationConfig: Record<string, unknown> = {}): Promise<string> {
  requireKeys("GEMINI_API_KEY");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 32000, ...generationConfig },
  });

  const problems: string[] = [];
  for (const model of modelOrder()) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { res, data } = await callModel(model, body);
      if (res.ok) {
        preferred = model;
        if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
        const cand = data.candidates?.[0];
        const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        if (cand?.finishReason === "MAX_TOKENS") throw new Error("Gemini ran out of output space; try a shorter TARGET_MINUTES.");
        if (!text) throw new Error(`Gemini returned no text (finishReason=${cand?.finishReason ?? "unknown"}).`);
        return text;
      }

      const message = data.error?.message ?? res.statusText;
      const details = JSON.stringify(data.error?.details ?? []);
      if (res.status === 404) break; // this model isn't available to your key: try the next one
      if (res.status !== 429 && res.status < 500) throw new GeminiError(res.status, message);

      const dailyLimit = /PerDay/i.test(details) || /per day/i.test(message);
      console.log(`  (${model}: ${res.status} ${dailyLimit ? "daily free limit reached" : message.split(".")[0]})`);
      if (dailyLimit) {
        problems.push(`${model}: daily free limit reached`);
        break; // no point waiting today: switch model
      }
      if (attempt === 3) {
        problems.push(`${model}: ${res.status} ${message.split(".")[0]}`);
        break;
      }
      // Wait as long as Google asks (RetryInfo), within reason.
      const retry = Number(details.match(/"retryDelay":"(\d+)/)?.[1] ?? 20 * attempt);
      const wait = Math.min(90, Math.max(10, retry));
      console.log(`  (waiting ${wait}s, then trying again…)`);
      await sleep(wait * 1000);
    }
  }
  throw new Error(
    `Google Gemini's free tier is busy or out of quota right now (${problems.join("; ") || "no model available"}). Try again later, or tomorrow if the daily limit is reached.`,
  );
}

class GeminiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`Gemini error ${status}: ${message}`);
  }
}

export const geminiText = (system: string, prompt: string) => generate(system, prompt);

function jsonSchemaFor(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned);
}

/** A call that must return JSON matching `schema`. */
export async function geminiStructured<T extends z.ZodType>(schema: T, system: string, prompt: string): Promise<z.infer<T>> {
  const jsonSchema = jsonSchemaFor(schema);
  let text: string;
  try {
    text = await generate(system, prompt, { responseMimeType: "application/json", responseJsonSchema: jsonSchema });
  } catch (e) {
    if (!(e instanceof GeminiError && e.status === 400)) throw e;
    // Some models don't accept every schema feature: describe the schema in the prompt instead.
    text = await generate(system, `${prompt}\n\nReply with only JSON matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`, {
      responseMimeType: "application/json",
    });
  }
  return schema.parse(parseJson(text)) as z.infer<T>;
}
