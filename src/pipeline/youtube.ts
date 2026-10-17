import fs from "node:fs";
import path from "node:path";
import { readSettings } from "../config.js";
import { brandOf, mentions, otherModel } from "../productName.js";
import type { FoundImage } from "../types.js";
import { run } from "./media.js";

/**
 * Short, muted clips from the maker's own YouTube channel (e.g. Apple's product announcement videos).
 * OFF by default: the footage is the maker's copyright and YouTube's Content ID can flag reused clips,
 * and YouTube often blocks downloads from cloud servers. Turn on with /ytclips on (or YOUTUBE_CLIPS=on).
 */
export function youtubeClipsEnabled() {
  const saved = readSettings().ytClips;
  if (saved !== undefined) return saved;
  return (process.env.YOUTUBE_CLIPS ?? "").trim().toLowerCase() === "on";
}

// Official channel names. Unknown brands must match the brand name exactly (e.g. "Nothing").
const CHANNELS: Record<string, string[]> = {
  apple: ["apple"],
  google: ["google", "made by google", "google pixel"],
  samsung: ["samsung", "samsung mobile"],
  microsoft: ["microsoft", "microsoft surface", "xbox"],
  sony: ["sony", "playstation", "sony | camera channel"],
  openai: ["openai"],
  anthropic: ["anthropic"],
  tesla: ["tesla"],
  meta: ["meta", "meta quest"],
  amazon: ["amazon", "amazon news", "amazon devices"],
  nvidia: ["nvidia", "nvidia geforce"],
  amd: ["amd"],
  lenovo: ["lenovo", "lenovo legion"],
  nintendo: ["nintendo of america", "nintendo"],
  oneplus: ["oneplus"],
  xiaomi: ["xiaomi"],
  dji: ["dji"],
};

type Entry = { id: string; title?: string; channel?: string; uploader?: string; duration?: number; channel_is_verified?: boolean };

const ytdlp = (args: string[]) => run("yt-dlp", ["--no-warnings", "--js-runtimes", "node", ...args]);

/** The maker's own videos about this exact product, short ones (announcements, ads, hands-on) first. */
export async function officialYouTubeVideos(product: string): Promise<{ id: string; title: string; duration: number; channel: string }[]> {
  const brand = brandOf(product);
  if (!brand) return [];
  const names = CHANNELS[brand] ?? [brand];
  const out = await ytdlp(["--flat-playlist", "--dump-json", `ytsearch20:${product}`]);
  const entries = out.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Entry);
  return entries
    .filter((e) => {
      const channel = (e.channel ?? e.uploader ?? "").toLowerCase().trim();
      const title = e.title ?? "";
      return names.includes(channel) && e.channel_is_verified !== false && mentions(title, product) && !otherModel(title, product) && (e.duration ?? 0) >= 15 && (e.duration ?? 0) <= 1200;
    })
    // Announcement/ad-length videos are mostly product shots; long keynotes are mostly people on stage.
    .sort((a, b) => Math.abs((a.duration ?? 0) - 120) - Math.abs((b.duration ?? 0) - 120))
    .map((e) => ({ id: e.id, title: e.title ?? "", duration: e.duration ?? 0, channel: e.channel ?? e.uploader ?? brand }));
}

/**
 * Download one 6-second muted section of an official video (only that section is fetched).
 * `nth` picks a different moment for each scene so the same shot isn't repeated.
 */
export async function youtubeClip(product: string, dir: string, nth: number): Promise<(FoundImage & { file: string; duration: number }) | null> {
  const videos = await officialYouTubeVideos(product);
  if (!videos.length) {
    console.log(`  · no official YouTube video found for "${product}"`);
    return null;
  }
  const video = videos[Math.floor(nth / 3) % videos.length];
  // Skip the opening and the closing logo; spread clips through the middle of the video.
  const at = Math.round(video.duration * [0.3, 0.5, 0.7][nth % 3]);
  const file = path.join(dir, `yt-${video.id}-${at}.mp4`);
  if (!fs.existsSync(file)) {
    const raw = `${file}.src.mp4`;
    await ytdlp(["-f", "bv*[height<=1080][ext=mp4]/bv*[height<=1080]/bv*", "--download-sections", `*${at}-${at + 6}`, "--force-keyframes-at-cuts", "-o", raw, `https://www.youtube.com/watch?v=${video.id}`]);
    const got = fs.readdirSync(dir).find((f) => f.startsWith(path.basename(raw).replace(/\.mp4$/, "")));
    if (!got) throw new Error("download produced no file");
    await run("ffmpeg", ["-y", "-v", "error", "-i", path.join(dir, got), "-an", "-t", "6", "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", file]);
    fs.rmSync(path.join(dir, got), { force: true });
  }
  return { url: `https://youtu.be/${video.id}`, source: `https://youtu.be/${video.id}?t=${at}`, credit: `${video.channel} (YouTube)`, title: video.title, file, duration: 6 };
}
