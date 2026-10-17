import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, readSettings, updateSettings } from "../config.js";
import { DEFAULT_KOKORO_VOICE, kokoroSpeak } from "./kokoro.js";
import { esc, sendMessage } from "../telegram.js";
import { jobMediaDir } from "../jobs.js";
import type { Scene, WordTiming } from "../types.js";
import { probeDuration, publicPath } from "./media.js";

/** Turn ElevenLabs' error reply into a clear message (it uses 401 for several different problems). */
function elevenLabsError(status: number, body: string): Error {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail ?? parsed);
  } catch {
    detail = body;
  }
  if (status === 402 || /paid_plan_required|payment_required/.test(body)) return new PaidVoiceError();
  if (/quota_exceeded/.test(body)) return new ElevenLabsUnavailable("Your ElevenLabs credits for this month are used up. They reset monthly, or you can upgrade your plan.");
  if (/unusual_activity|detected_unusual/.test(body))
    return new ElevenLabsUnavailable(
      "ElevenLabs blocked its free plan from this computer ('unusual activity'). The free plan often refuses cloud servers like GitHub and VPNs. Fix: make videos from your laptop, or upgrade ElevenLabs to Starter (about $5/month).",
    );
  if (/invalid_api_key|api.key/i.test(detail)) return new Error("ElevenLabs says the API key is invalid. Check ELEVENLABS_API_KEY.");
  return new Error(`ElevenLabs said (${status}): ${detail.slice(0, 300)}`);
}

/** How many voice characters are left this month (null if unknown). */
export type Credits = { error: string } | { tier: string; used: number; limit: number; resets: string | null };
export async function elevenLabsCredits(): Promise<Credits> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": config.elevenlabs.apiKey } });
    if (!res.ok) return { error: elevenLabsError(res.status, await res.text()).message };
    const d = (await res.json()) as { tier: string; character_count: number; character_limit: number; next_character_count_reset_unix?: number };
    return {
      tier: d.tier,
      used: d.character_count,
      limit: d.character_limit,
      resets: d.next_character_count_reset_unix ? new Date(d.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) : null,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** A premade ElevenLabs voice ("Brian") that works on the free plan. */
const FREE_FALLBACK_VOICE = "nPczCjzI2devNBz1zQrb";

/** ElevenLabs can't be used right now (credits used up, or free plan blocked on this server). */
class ElevenLabsUnavailable extends Error {}

class PaidVoiceError extends Error {
  constructor() {
    super("This ElevenLabs voice needs a paid plan. On the free plan, use a voice marked (premade): send /voices in Telegram, then /voice followed by the ID you like.");
  }
}

export type VoiceClip = { file: string; duration: number; words: WordTiming[] };

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

function wordsFromAlignment(a: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  let cur: WordTiming | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { word: "", start: a.character_start_times_seconds[i], end: 0 };
    cur.word += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
}

async function elevenLabs(text: string, previous: string, next: string, outFile: string): Promise<WordTiming[]> {
  const { apiKey, voiceId, model } = config.elevenlabs;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: model,
        previous_text: previous || undefined,
        next_text: next || undefined,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { audio_base64: string; alignment: Alignment | null; normalized_alignment: Alignment | null };
      fs.writeFileSync(outFile, Buffer.from(data.audio_base64, "base64"));
      const a = data.alignment ?? data.normalized_alignment;
      return a ? wordsFromAlignment(a) : [];
    }
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw elevenLabsError(res.status, body);
  }
}

/**
 * Voice every scene. Clips are cached by (voice, model, text), so on a revision only
 * the scenes whose narration changed are re-recorded.
 */
export async function voiceScenes(jobId: string, scenes: Scene[], engine?: "elevenlabs" | "kokoro"): Promise<Record<string, VoiceClip>> {
  const settings = readSettings();
  const kokoroVoice = settings.kokoroVoice ?? DEFAULT_KOKORO_VOICE;
  const hasEleven = Boolean(config.elevenlabs.apiKey && config.elevenlabs.voiceId);
  engine ??= settings.voiceEngine === "kokoro" || !hasEleven ? "kokoro" : "elevenlabs";
  console.log(engine === "elevenlabs" ? "🎙️  Recording voice-over (ElevenLabs)…" : `🎙️  Recording voice-over (free Kokoro voice: ${kokoroVoice})…`);
  const dir = path.join(jobMediaDir(jobId), "voice");
  fs.mkdirSync(dir, { recursive: true });

  const clips: Record<string, VoiceClip> = {};
  for (const [i, scene] of scenes.entries()) {
    const voiceKey = engine === "elevenlabs" ? `${config.elevenlabs.voiceId}|${config.elevenlabs.model}` : `kokoro|${kokoroVoice}`;
    const key = crypto.createHash("sha1").update(`${voiceKey}|${scene.narration}`).digest("hex").slice(0, 16);
    const file = path.join(dir, `${key}.mp3`);
    const meta = path.join(dir, `${key}.json`);
    let words: WordTiming[];
    if (fs.existsSync(file) && fs.existsSync(meta)) {
      words = JSON.parse(fs.readFileSync(meta, "utf8"));
    } else {
      try {
        words =
          engine === "elevenlabs"
            ? await elevenLabs(scene.narration, scenes[i - 1]?.narration ?? "", scenes[i + 1]?.narration ?? "", file)
            : await kokoroSpeak(scene.narration, kokoroVoice, file);
      } catch (e) {
        if (e instanceof PaidVoiceError && config.elevenlabs.voiceId !== FREE_FALLBACK_VOICE) {
          // The chosen voice needs a paid plan: switch to a free premade voice once and start over.
          updateSettings({ voiceId: FREE_FALLBACK_VOICE });
          await sendMessage("🎙️ Your saved voice needs a paid ElevenLabs plan, so I switched to <b>Brian</b> (free). Send /voices to pick another.").catch(() => {});
          return voiceScenes(jobId, scenes, engine);
        }
        if (e instanceof ElevenLabsUnavailable && engine === "elevenlabs") {
          // Out of credits (or blocked): use the free voice for the whole video so it sounds consistent.
          await sendMessage(`🎙️ ${esc(e.message)}\nUsing the free Kokoro voice for this video instead.`).catch(() => {});
          return voiceScenes(jobId, scenes, "kokoro");
        }
        throw e;
      }
      fs.writeFileSync(meta, JSON.stringify(words));
      console.log(`  • scene ${i + 1}/${scenes.length} recorded`);
    }
    clips[scene.id] = { file: publicPath(file), duration: await probeDuration(file), words };
  }
  return clips;
}
