import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { config, requireKeys } from "./config.js";

let client: Anthropic | null = null;
function getClient() {
  requireKeys("ANTHROPIC_API_KEY");
  client ??= new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

function assertNotRefused(msg: Anthropic.Message) {
  if (msg.stop_reason === "refusal") {
    throw new Error(`Claude declined this request (${msg.stop_details?.category ?? "no category"}).`);
  }
}

/**
 * Research with live web search. Handles pause_turn (the server-side search
 * loop pausing) by re-sending the conversation so it resumes.
 */
export async function researchWithWeb(system: string, prompt: string, maxSearches = 12): Promise<string> {
  const anthropic = getClient();
  const tools: Anthropic.ToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let msg: Anthropic.Message | null = null;

  for (let i = 0; i < 5; i++) {
    msg = await anthropic.messages
      .stream({
        model: config.anthropic.model,
        max_tokens: 32000,
        system,
        output_config: { effort: "high" },
        tools,
        messages,
      })
      .finalMessage();
    assertNotRefused(msg);
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }

  return (msg?.content ?? [])
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** A call that must return JSON matching `schema`. Streamed so long outputs don't hit HTTP timeouts. */
export async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string,
  effort: "low" | "medium" | "high" | "xhigh" = "high",
): Promise<z.infer<T>> {
  const anthropic = getClient();
  const msg = await anthropic.messages
    .stream({
      model: config.anthropic.model,
      max_tokens: 64000,
      system,
      output_config: { effort, format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();
  assertNotRefused(msg);
  if (msg.stop_reason === "max_tokens") throw new Error("Claude ran out of output space; try a shorter TARGET_MINUTES.");
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return schema.parse(JSON.parse(text)) as z.infer<T>;
}
