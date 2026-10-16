import { z } from "zod";
import { config, requireKeys } from "./config.js";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string; status: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generate(system: string, prompt: string, generationConfig: Record<string, unknown> = {}): Promise<string> {
  requireKeys("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.gemini.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 32000, ...generationConfig },
      }),
      signal: AbortSignal.timeout(600_000),
    });
    const data = (await res.json()) as GeminiResponse;
    // The free tier has tight per-minute limits: wait and try again.
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      console.log(`  (Gemini busy or rate-limited, waiting ${30 * attempt}s…)`);
      await sleep(30_000 * attempt);
      continue;
    }
    if (!res.ok) throw new GeminiError(res.status, data.error?.message ?? res.statusText);
    if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (cand?.finishReason === "MAX_TOKENS") throw new Error("Gemini ran out of output space; try a shorter TARGET_MINUTES.");
    if (!text) throw new Error(`Gemini returned no text (finishReason=${cand?.finishReason ?? "unknown"}).`);
    return text;
  }
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
