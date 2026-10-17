import { config } from "../config.js";
import { structured } from "../ai.js";
import { VideoPlanSchema, type VideoPlan } from "../types.js";

const WORDS_PER_MINUTE = 155;

function writerSystem() {
  const c = config.channel;
  return `You are the head writer and director for "${c.name}", a YouTube channel about ${c.niche}.
Voice and style: ${c.style}

You write scripts that keep people watching:
- The first scene is the hook: within 2 sentences, state the most surprising fact or question. No "hey guys", no "welcome back", no channel intro.
- Promise a payoff early ("by the end you'll know whether…") and deliver it.
- Change something every scene: a new visual, a number, a comparison, a turn in the argument. Scenes are 1-4 spoken sentences (about 5-15 seconds).
- Talk to one viewer ("you"). Use contractions. Read every line out loud in your head; it must sound natural spoken by a human host, not like an article.
- Use only facts from the research brief. Never invent specs, prices, dates or quotes.
- End with a clear verdict and a short, natural call to subscribe (one sentence, no begging).

You also direct the visuals, scene by scene. Accuracy beats decoration: never show something that could be mistaken for the wrong product.
- Mix scene kinds and never use the same kind more than twice in a row. A good mix for a 3-8 minute video:
  - "process" (2-3 per video): animated how-it-works diagrams. Use them whenever you explain how something works (e.g. "Battery 🔋 → Motors ⚙️ → Thrusters 💨 → Lift-off 🚀").
  - "specs" and "timeline" (1-2 each): animated spec sheets and history/roadmaps.
  - "product" (1-3): the product's name presented on screen at key moments. Set "product" to its exact name.
  - "stat", "compare", "list", "title", "quote" for numbers, comparisons, key points and punchlines.
  - "broll" (at most 30%): real stock footage, ONLY for general moods that can't be wrong: city at night, engineers in a lab, a person scrolling a phone, a highway, a factory, money, a crowd. Never for a specific product, brand or model.
- broll_query: a concrete, generic stock-footage search (e.g. "night highway traffic", "engineers working lab", "person scrolling phone"). Never include brand or model names; a stock search for "Tesla Roadster" or "iPhone 18" would return the wrong product.
- Set "product" only on scenes that present the product itself; leave it null elsewhere.
- On-screen text must be short. Headings max 6 words.
- Only use kind "screenshot" with a public https URL listed in the brief.
- Write narration for a voice actor: plain words, no symbols, abbreviations or emojis. Numbers are fine as digits ("$999", "0.8 seconds", "2028").`;
}

export async function writeScript(topicTitle: string, brief: string): Promise<VideoPlan> {
  console.log("✍️  Writing script and shot list…");
  const words = config.channel.targetMinutes * WORDS_PER_MINUTE;
  return structured(
    VideoPlanSchema,
    writerSystem(),
    `Write the full video for: ${topicTitle}

Target length: about ${config.channel.targetMinutes} minutes (~${words} spoken words in total across all scenes).

Research brief:
${brief}`,
  );
}

export async function reviseScript(
  plan: VideoPlan,
  brief: string,
  feedback: string,
  timeline: string,
): Promise<VideoPlan> {
  console.log("🛠️  Revising script from feedback…");
  return structured(
    VideoPlanSchema,
    writerSystem(),
    `The channel owner reviewed this video and asked for changes. Apply ALL of their feedback.

Rules for revising:
- Keep every scene the feedback does not touch EXACTLY as it is (same id, same narration character for character) so its existing voice-over can be reused.
- Timestamps in the feedback (like 2:14) refer to the current cut; use the timeline below to find the right scene.
- If they ask for something the research brief can't support with facts, do the best honest version and don't invent facts.

Timeline of the current cut (start time - scene id - first words):
${timeline}

Owner feedback:
"""${feedback}"""

Current video plan (JSON):
${JSON.stringify(plan, null, 2)}

Research brief:
${brief}`,
  );
}
