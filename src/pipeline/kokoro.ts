import fs from "node:fs";
import type { WordTiming } from "../types.js";
import { run } from "./media.js";

/**
 * Kokoro: a free, open-source (Apache 2.0) voice that runs on an ordinary CPU, no key or credits.
 * Used when ElevenLabs credits run out, or when you choose a Kokoro voice with /voice.
 */
export const KOKORO_VOICES: Record<string, string> = {
  af_heart: "Heart – warm female, US (best quality)",
  af_bella: "Bella – energetic female, US",
  af_nicole: "Nicole – soft female, US",
  bf_emma: "Emma – female, British",
  am_michael: "Michael – male, US",
  am_fenrir: "Fenrir – deep male, US",
  am_puck: "Puck – lively male, US",
  bm_george: "George – male, British",
  bm_fable: "Fable – male, British",
};
export const DEFAULT_KOKORO_VOICE = "af_heart";
const SAMPLE_RATE = 24000;

type Tts = { generate(text: string, opts: { voice: string; speed?: number }): Promise<{ audio: Float32Array }> };
let tts: Promise<Tts> | null = null;

function load() {
  tts ??= (async () => {
    console.log("  (loading the free Kokoro voice model, first time takes a minute…)");
    const { KokoroTTS } = await import("kokoro-js");
    return (await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" })) as unknown as Tts;
  })();
  return tts;
}

function writeWav(file: string, samples: Float32Array) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

/** Split into sentences so each gets its own timing (keeps captions in sync). */
const sentences = (text: string) => text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];

/**
 * Speak `text` into an mp3. Word timings are estimated per sentence
 * (Kokoro doesn't report them), which is close enough for captions.
 */
export async function kokoroSpeak(text: string, voice: string, outFile: string): Promise<WordTiming[]> {
  const model = await load();
  const gap = new Float32Array(Math.round(SAMPLE_RATE * 0.12)); // short breath between sentences
  const parts: Float32Array[] = [];
  const words: WordTiming[] = [];
  let t = 0;
  for (const sentence of sentences(text)) {
    const { audio } = await model.generate(sentence, { voice, speed: 1.0 });
    const duration = audio.length / SAMPLE_RATE;
    const tokens = sentence.split(/\s+/).filter(Boolean);
    const weight = tokens.reduce((n, w) => n + w.length + 1, 0);
    let cursor = t + 0.05;
    for (const word of tokens) {
      const len = ((word.length + 1) / weight) * Math.max(0.1, duration - 0.15);
      words.push({ word, start: cursor, end: cursor + len * 0.92 });
      cursor += len;
    }
    parts.push(audio, gap);
    t += duration + gap.length / SAMPLE_RATE;
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.length;
  }
  const wav = outFile.replace(/\.mp3$/, ".wav");
  writeWav(wav, all);
  await run("ffmpeg", ["-y", "-v", "error", "-i", wav, "-codec:a", "libmp3lame", "-q:a", "3", outFile]);
  fs.rmSync(wav, { force: true });
  return words;
}
