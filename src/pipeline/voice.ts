import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, updateSettings } from "../config.js";
import { sendMessage } from "../telegram.js";
import { jobMediaDir } from "../jobs.js";
import type { Scene, WordTiming } from "../types.js";
import { probeDuration, publicPath, run } from "./media.js";

/** A premade ElevenLabs voice ("Brian") that works on the free plan. */
const FREE_FALLBACK_VOICE = "nPczCjzI2devNBz1zQrb";

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
    if (res.status === 402 || /paid_plan_required|payment_required/.test(body)) throw new PaidVoiceError();
    if (res.status === 401) throw new Error("ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.");
    if (/quota_exceeded/.test(body)) throw new Error("Your ElevenLabs credits for this month are used up. Wait for the monthly reset or upgrade.");
    throw new Error(`ElevenLabs error ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** Silent placeholder voice so the pipeline can be tested without an ElevenLabs key. */
async function placeholder(text: string, outFile: string): Promise<WordTiming[]> {
  const tokens = text.split(/\s+/).filter(Boolean);
  const perWord = 0.38;
  const duration = Math.max(2, tokens.length * perWord);
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", duration.toFixed(2), "-q:a", "9", outFile]);
  return tokens.map((word, i) => ({ word, start: i * perWord, end: (i + 1) * perWord - 0.04 }));
}

/**
 * Voice every scene. Clips are cached by (voice, model, text), so on a revision only
 * the scenes whose narration changed are re-recorded.
 */
export async function voiceScenes(jobId: string, scenes: Scene[]): Promise<Record<string, VoiceClip>> {
  const useReal = Boolean(config.elevenlabs.apiKey && config.elevenlabs.voiceId);
  console.log(useReal ? "🎙️  Recording voice-over (ElevenLabs)…" : "🎙️  No ElevenLabs key: using a silent placeholder voice.");
  const dir = path.join(jobMediaDir(jobId), "voice");
  fs.mkdirSync(dir, { recursive: true });

  const clips: Record<string, VoiceClip> = {};
  for (const [i, scene] of scenes.entries()) {
    const key = crypto
      .createHash("sha1")
      .update([useReal ? config.elevenlabs.voiceId : "placeholder", config.elevenlabs.model, scene.narration].join("|"))
      .digest("hex")
      .slice(0, 16);
    const file = path.join(dir, `${key}.mp3`);
    const meta = path.join(dir, `${key}.json`);
    let words: WordTiming[];
    if (fs.existsSync(file) && fs.existsSync(meta)) {
      words = JSON.parse(fs.readFileSync(meta, "utf8"));
    } else {
      try {
        words = useReal
          ? await elevenLabs(scene.narration, scenes[i - 1]?.narration ?? "", scenes[i + 1]?.narration ?? "", file)
          : await placeholder(scene.narration, file);
      } catch (e) {
        // The chosen voice needs a paid plan: switch to a free premade voice once and start over.
        if (!(e instanceof PaidVoiceError) || config.elevenlabs.voiceId === FREE_FALLBACK_VOICE) throw e;
        updateSettings({ voiceId: FREE_FALLBACK_VOICE });
        await sendMessage("🎙️ Your saved voice needs a paid ElevenLabs plan, so I switched to <b>Brian</b> (free). Send /voices to pick another.").catch(() => {});
        return voiceScenes(jobId, scenes);
      }
      fs.writeFileSync(meta, JSON.stringify(words));
      console.log(`  • scene ${i + 1}/${scenes.length} recorded`);
    }
    clips[scene.id] = { file: publicPath(file), duration: await probeDuration(file), words };
  }
  return clips;
}
