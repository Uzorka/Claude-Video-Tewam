import type { z } from "zod";
import { structured as claudeStructured } from "./claude.js";
import { config } from "./config.js";
import { geminiStructured } from "./gemini.js";

/** Structured JSON from whichever AI is configured (Claude or Gemini). */
export function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string,
  effort: "low" | "medium" | "high" | "xhigh" = "high",
): Promise<z.infer<T>> {
  return config.aiProvider === "gemini" ? geminiStructured(schema, system, prompt) : claudeStructured(schema, system, prompt, effort);
}
