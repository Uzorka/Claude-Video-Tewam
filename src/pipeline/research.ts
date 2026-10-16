import { config } from "../config.js";
import { researchWithWeb } from "../claude.js";
import type { Topic } from "../types.js";

export async function researchTopic(topic: Topic): Promise<string> {
  console.log(`📚 Researching: ${topic.title}`);
  return researchWithWeb(
    `You are the research producer for "${config.channel.name}", a tech YouTube channel. Your brief is the ONLY source of facts the scriptwriter may use, so it must be accurate, specific and current. Today is ${new Date().toISOString().slice(0, 10)}.`,
    `Research this video topic using web search. Check multiple reliable sources (official announcements, reputable tech press, benchmarks). Where sources disagree, say so.

Topic: ${topic.title}
Angle: ${topic.angle}
Why now: ${topic.why_now}
Starting links: ${topic.source_urls.join(", ") || "none"}

Write a research brief in Markdown with these sections:
1. **The story in 3 sentences**
2. **Key facts** - specs, prices, dates, availability, numbers (with the source for each)
3. **Context** - what came before, competitors, how this compares
4. **What viewers will want to know** - the real questions people are asking
5. **Opinions and controversy** - credible criticism and praise
6. **Our take** - a clear, defensible opinion for the video
7. **Visual ideas** - things worth showing; include 1-3 public, non-paywalled https URLs (official product or announcement pages) that would look good scrolled on screen
8. **Sources** - every URL you used`,
  );
}
