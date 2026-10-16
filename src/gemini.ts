import { z } from "zod";
import { config, requireKeys } from "./config.js";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string; status: string; details?: unknown[] };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Free-tier limits are per model, and busy periods hit models separately, so we
 * rotate through every text model your key can use. The one that last worked goes first.
 */
let preferred: string | null = null;
const exhausted = new Set<string>(); // hit the daily free limit during this run
let discovered: string[] | null = null;

/** Ask Google which text models this key can use (instead of guessing names). */
async function textModels(): Promise<string[]> {
  if (!discovered) {
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": config.gemini.apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      discovered = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|embed|vision|robotics|computer/.test(n))
        // Stable models first, then "latest" aliases, then previews.
        .sort((a, b) => rank(a) - rank(b));
    } catch {
      discovered = [];
    }
    if (!discovered.length) discovered = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
    console.log(`  (Gemini models available: ${discovered.slice(0, 8).join(", ")})`);
  }
  return discovered;
}
const rank = (n: string) => (/preview|exp/.test(n) ? 2 : /latest/.test(n) ? 1 : 0) + (/lite/.test(n) ? 0.5 : 0);

async function modelOrder() {
  const all = [preferred, config.gemini.model, ...(await textModels())].filter((m): m is string => Boolean(m));
  return [...new Set(all)].filter((m) => !exhausted.has(m));
}

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

  // Busy spells ("high demand") usually pass within minutes, so keep cycling through
  // the models for up to ~15 minutes before giving up.
  const ROUNDS = 5;
  let last = "";
  for (let round = 1; round <= ROUNDS; round++) {
    const models = await modelOrder();
    if (!models.length) break;
    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { res, data } = await callModel(model, body);
        if (res.ok) {
          preferred = model;
          if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
          const cand = data.candidates?.[0];
          const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
          if (cand?.finishReason === "MAX_TOKENS") throw new Error("Gemini ran out of output space; try a shorter TARGET_MINUTES.");
          if (!text) throw new Error(`Gemini returned no text (finishReason=${cand?.finishReason ?? "unknown"}).`);
          if (round > 1 || model !== models[0]) console.log(`  (✓ ${model} answered)`);
          return text;
        }

        const message = data.error?.message ?? res.statusText;
        const details = JSON.stringify(data.error?.details ?? []);
        if (res.status === 404) {
          exhausted.add(model); // not available to this key
          break;
        }
        if (res.status !== 429 && res.status < 500) throw new GeminiError(res.status, message);

        const dailyLimit = /PerDay/i.test(details) || /per day/i.test(message);
        last = `${model}: ${dailyLimit ? "daily free limit reached" : message.split(".")[0]}`;
        console.log(`  (${res.status} ${last})`);
        if (dailyLimit) {
          exhausted.add(model);
          break;
        }
        if (attempt === 1) {
          // A per-minute limit says how long to wait; "high demand" often clears quickly.
          const retry = Number(details.match(/"retryDelay":"(\d+)/)?.[1] ?? 10);
          await sleep(Math.min(60, Math.max(5, retry)) * 1000);
        }
      }
    }
    if (round < ROUNDS && (await modelOrder()).length) {
      const pause = 60 * round;
      console.log(`  (all Gemini models are busy; waiting ${pause}s before round ${round + 1} of ${ROUNDS}…)`);
      await sleep(pause * 1000);
    }
  }
  throw new Error(
    `Google Gemini's free tier is busy or out of quota right now (last: ${last || "no model available"}). ` +
      ((await modelOrder()).length ? "It usually clears within an hour." : "The daily free limit is used up; it resets tomorrow."),
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
