import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const JOBS_DIR = path.join(ROOT, "jobs");
export const STATE_DIR = path.join(ROOT, "state");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const OUT_DIR = path.join(ROOT, "out");

const env = (name: string, fallback = "") => (process.env[name] ?? "").trim() || fallback;

/** Everything the studio can be configured with. Secrets come from env vars / GitHub Secrets. */
export const config = {
  channel: {
    name: env("CHANNEL_NAME", "Uzorka Tech"),
    niche: env(
      "CHANNEL_NICHE",
      "AI and consumer tech: new AI models and tools, gadgets, smartphones, chips, and the tech industry",
    ),
    style: env(
      "CHANNEL_STYLE",
      "Confident, clear and opinionated like MKBHD, Mrwhosetheboss and Mr Mobile. Plain English, short sentences, real takeaways, no hype words, no filler.",
    ),
    targetMinutes: Number(env("TARGET_MINUTES", "8")),
  },
  /** Which AI writes everything: "anthropic" (Claude, paid, best) or "gemini" (Google, has a free tier). */
  aiProvider: (env("AI_PROVIDER") || (env("ANTHROPIC_API_KEY") ? "anthropic" : "gemini")) as "anthropic" | "gemini",
  anthropic: {
    apiKey: env("ANTHROPIC_API_KEY"),
    model: env("CLAUDE_MODEL", "claude-opus-5-5"),
  },
  gemini: {
    apiKey: env("GEMINI_API_KEY"),
    model: env("GEMINI_MODEL", "gemini-flash-latest"),
  },
  elevenlabs: {
    apiKey: env("ELEVENLABS_API_KEY"),
    voiceId: env("ELEVENLABS_VOICE_ID"),
    model: env("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
  },
  pexels: { apiKey: env("PEXELS_API_KEY") },
  pixabay: { apiKey: env("PIXABAY_API_KEY") },
  youtube: {
    apiKey: env("YOUTUBE_API_KEY"),
    clientId: env("YOUTUBE_CLIENT_ID"),
    clientSecret: env("YOUTUBE_CLIENT_SECRET"),
    refreshToken: env("YOUTUBE_REFRESH_TOKEN"),
    /** "manual": you upload the approved file yourself. "api": the studio uploads it (needs an audited Google project to go public). */
    publishMode: env("PUBLISH_MODE", "manual") as "manual" | "api",
  },
  telegram: {
    botToken: env("TELEGRAM_BOT_TOKEN"),
    chatId: env("TELEGRAM_CHAT_ID"),
  },
  github: {
    token: env("GITHUB_TOKEN"),
    repo: env("GITHUB_REPOSITORY"),
  },
  browserPath: env("BROWSER_EXECUTABLE"),
};

/**
 * Settings changed from Telegram (voice, which chat owns the bot) live in state/settings.json,
 * so they survive both laptop restarts and cloud runs (the workflow saves state/ to git).
 */
export type StudioSettings = {
  voiceId?: string; // ElevenLabs voice
  ownerChatId?: string;
  /** "auto" = ElevenLabs while credits last, then the free Kokoro voice. "kokoro" = always Kokoro. */
  voiceEngine?: "auto" | "kokoro";
  kokoroVoice?: string;
  /** Short muted clips from the maker's official YouTube channel (off unless switched on). */
  ytClips?: boolean;
};
const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");

export function readSettings(): StudioSettings {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as StudioSettings;
  } catch {
    return {};
  }
}

export function updateSettings(patch: StudioSettings) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ ...readSettings(), ...patch }, null, 2) + "\n");
  if (patch.voiceId) config.elevenlabs.voiceId = patch.voiceId;
  if (patch.ownerChatId && !config.telegram.chatId) config.telegram.chatId = patch.ownerChatId;
}

{
  const saved = readSettings();
  if (saved.voiceId) config.elevenlabs.voiceId = saved.voiceId;
  if (!config.telegram.chatId && saved.ownerChatId) config.telegram.chatId = saved.ownerChatId;
}

export function requireKeys(...names: string[]) {
  const missing = names.filter((n) => !(process.env[n] ?? "").trim());
  if (missing.length) {
    throw new Error(
      `Missing settings: ${missing.join(", ")}. Add them as GitHub Secrets (see SETUP.md).`,
    );
  }
}

/** Save one setting into the .env file (used when running on your own computer). */
export function saveEnv(name: string, value: string) {
  const file = path.join(ROOT, ".env");
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith(`${name}=`)) : [];
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines.push(`${name}=${value}`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  process.env[name] = value;
}
