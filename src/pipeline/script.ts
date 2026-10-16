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

You also direct the visuals, scene by scene:
- Mix scene kinds. Roughly half should be "broll" (real stock footage), the rest title/stat/list/compare/quote/screenshot. Never use the same kind more than twice in a row.
- Every scene gets a broll_query (concrete, filmable stock-footage search like "person using smartphone", "server room", "circuit board macro") - it's used as the background.
- On-screen text must be short. Headings max 6 words.
- Only use kind "screenshot" with a public https URL listed in the brief.
- Write numbers in narration the way they're spoken ("nine hundred ninety-nine dollars" is not needed - "$999" is fine; TTS reads it), but avoid unusual symbols and abbreviations a voice would stumble on.`;
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
