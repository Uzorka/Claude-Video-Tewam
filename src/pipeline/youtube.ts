import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSettings } from "../config.js";
import { brandOf, coreWords, mentions, otherModel } from "../productName.js";
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

// Official channel handles, searched first (a general search buries brand videos under reviews).
const HANDLES: Record<string, string> = {
  apple: "@Apple", google: "@madebygoogle", samsung: "@Samsung", microsoft: "@Microsoft", sony: "@Sony", openai: "@OpenAI",
  anthropic: "@anthropic-ai", tesla: "@tesla", meta: "@Meta", amazon: "@amazon", nvidia: "@NVIDIA", oneplus: "@OnePlus", xiaomi: "@Xiaomi", dji: "@DJI",
};

type Entry = { id: string; title?: string; channel?: string; uploader?: string; duration?: number; channel_is_verified?: boolean };

/**
 * YouTube blocks downloads from cloud servers ("confirm you're not a bot") unless signed in.
 * YT_COOKIES (a GitHub secret) holds cookies exported from a SPARE YouTube account; on a laptop it usually isn't needed.
 */
let cookieFile: string | null = null;
function cookies() {
  const text = (process.env.YT_COOKIES ?? "").trim();
  if (!text) return [];
  if (!cookieFile) {
    cookieFile = path.join(os.tmpdir(), "yt-cookies.txt");
    fs.writeFileSync(cookieFile, text.startsWith("# ") ? `${text}\n` : `# Netscape HTTP Cookie File\n${text}\n`, { mode: 0o600 });
  }
  return ["--cookies", cookieFile];
}

// In the cloud, HD formats need a PO token from the bgutil helper the workflow starts (otherwise YouTube offers 360p only).
// mweb + the PO token is the combination yt-dlp recommends when an account gets YouTube's "SABR-only" streaming (360p only otherwise).
const ytdlp = (args: string[]) =>
  run("yt-dlp", ["--no-warnings", "--js-runtimes", "node", "--extractor-args", "youtube:player_client=mweb,default", ...cookies(), ...args]);

/** The maker's own videos about this exact product, short ones (announcements, ads, hands-on) first. */
export async function officialYouTubeVideos(product: string): Promise<{ id: string; title: string; duration: number; channel: string }[]> {
  const brand = brandOf(product);
  if (!brand) return [];
  const names = CHANNELS[brand] ?? [brand];
  const parse = (out: string) => out.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Entry);
  const entries: Entry[] = [];
  const handle = HANDLES[brand];
  if (handle) {
    const query = coreWords(product).join(" ");
    try {
      // Videos found inside the official channel are the brand's own, whatever the entry's channel field says.
      const own = parse(await ytdlp(["--flat-playlist", "--dump-json", "--playlist-end", "20", `https://www.youtube.com/${handle}/search?query=${encodeURIComponent(query)}`]));
      entries.push(...own.map((e) => ({ ...e, channel: e.channel ?? names[0], uploader: e.uploader ?? names[0] })));
    } catch (e) {
      console.log(`  (channel search: ${(e as Error).message.split("\n").find((l) => /error/i.test(l)) ?? "failed"})`);
    }
  }
  entries.push(...parse(await ytdlp(["--flat-playlist", "--dump-json", `ytsearch20:${product}`])));
  if (process.env.YT_DEBUG) for (const e of entries.slice(0, 12)) console.log(`    [yt] ${e.channel ?? "?"} / ${e.uploader ?? "?"} / ${e.channel_is_verified} / ${e.duration} / ${e.title}`);
  return entries
    .filter((e) => {
      const channel = (e.channel ?? e.uploader ?? "").toLowerCase().trim();
      const title = e.title ?? "";
      return names.includes(channel) && e.channel_is_verified !== false && mentions(title, product) && !otherModel(title, product) && (e.duration ?? 0) >= 15 && (e.duration ?? 0) <= 1200;
    })
    .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
    // Announcement/ad-length videos are mostly product shots; long keynotes are mostly people on stage.
    .sort((a, b) => Math.abs((a.duration ?? 0) - 120) - Math.abs((b.duration ?? 0) - 120))
    .map((e) => ({ id: e.id, title: e.title ?? "", duration: e.duration ?? 0, channel: e.channel ?? e.uploader ?? brand }));
}

/**
 * Download one 6-second muted section of an official video (only that section is fetched).
 * `nth` picks a different moment for each scene so the same shot isn't repeated.
 */
export async function youtubeClip(product: string, dir: string, nth: number): Promise<(FoundImage & { file: string; duration: number; lowRes: boolean }) | null> {
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
    if (process.env.YT_DEBUG) {
      const out = await run("bash", ["-c", `yt-dlp --js-runtimes node ${cookies().join(" ")} -F "https://www.youtube.com/watch?v=${video.id}" 2>&1 || true`]);
      console.log(out.split("\n").filter((l) => /WARNING|ERROR|video only|^\d+\s+mp4/.test(l)).slice(-25).join("\n"));
      console.log(await run("bash", ["-c", "which yt-dlp; yt-dlp --version; node --version; tail -5 /tmp/pot.log 2>/dev/null || true"]));
    }
    // Best video up to 1080p (sorted by resolution, so a 360p file isn't picked when 1080p exists).
    await ytdlp(["-f", "bv*", "-S", "res:1080,vcodec:avc1", "--download-sections", `*${at}-${at + 6}`, "--force-keyframes-at-cuts", "-o", raw, `https://www.youtube.com/watch?v=${video.id}`]);
    const got = fs.readdirSync(dir).find((f) => f.startsWith(path.basename(raw).replace(/\.mp4$/, "")));
    if (!got) throw new Error("download produced no file");
    await run("ffmpeg", ["-y", "-v", "error", "-i", path.join(dir, got), "-an", "-t", "6", "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", file]);
    fs.rmSync(path.join(dir, got), { force: true });
  }
  const height = Number((await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", file])).trim());
  return { lowRes: height < 700, url: `https://youtu.be/${video.id}`, source: `https://youtu.be/${video.id}?t=${at}`, credit: `${video.channel} (YouTube)`, title: video.title, file, duration: 6 };
}
