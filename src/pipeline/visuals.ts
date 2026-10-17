import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, config } from "../config.js";
import { jobMediaDir } from "../jobs.js";
import { ensureLocal, findInLibrary, type LibraryItem } from "../library.js";
import type { FoundImage, Scene } from "../types.js";
import { download, publicPath, run } from "./media.js";

/** One downloadable stock clip, whichever library it came from. */
type Clip = { id: string; duration: number; url: string };

const hash = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return (await res.json()) as T;
}

type PexelsVideo = {
  id: number;
  duration: number;
  video_files: { link: string; width: number | null; file_type: string }[];
};

async function pexelsSearch(query: string): Promise<Clip[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&size=medium&per_page=15`;
  const { videos } = await getJson<{ videos: PexelsVideo[] }>(url, { Authorization: config.pexels.apiKey });
  return videos.flatMap((v) => {
    // Closest to 1080p, never smaller than 720p.
    const file = v.video_files
      .filter((f) => f.file_type === "video/mp4" && (f.width ?? 0) >= 1280)
      .sort((a, b) => Math.abs((a.width ?? 0) - 1920) - Math.abs((b.width ?? 0) - 1920))[0];
    return file ? [{ id: `pexels-${v.id}`, duration: v.duration, url: file.link }] : [];
  });
}

type PixabayVideo = {
  id: number;
  duration: number;
  videos: Record<"large" | "medium" | "small", { url: string; width: number; height: number } | undefined>;
};

async function pixabaySearch(query: string): Promise<Clip[]> {
  const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(config.pixabay.apiKey)}&q=${encodeURIComponent(query)}&per_page=15&safesearch=true`;
  const { hits } = await getJson<{ hits: PixabayVideo[] }>(url);
  return hits.flatMap((v) => {
    const file = [v.videos.large, v.videos.medium].find((f) => f?.url && f.width >= 1280 && f.width > f.height);
    return file ? [{ id: `pixabay-${v.id}`, duration: v.duration, url: file.url }] : [];
  });
}

/** Stock b-roll per scene from Pexels and/or Pixabay, never reusing the same clip twice in one video. */
export async function fetchBroll(jobId: string, scenes: Scene[], minSeconds: Record<string, number>) {
  const out: Record<string, { file: string; duration: number }> = {};
  const libraries = [
    ...(config.pexels.apiKey ? [pexelsSearch] : []),
    ...(config.pixabay.apiKey ? [pixabaySearch] : []),
  ];
  if (!libraries.length) {
    console.log("🎞️  No stock footage key (PIXABAY_API_KEY or PEXELS_API_KEY): scenes will use animated backgrounds.");
    return out;
  }
  console.log("🎞️  Finding b-roll footage…");
  const dir = path.join(jobMediaDir(jobId), "broll");
  fs.mkdirSync(dir, { recursive: true });
  const used = new Set<string>();
  const cache = new Map<string, Clip[]>();

  async function search(query: string) {
    if (!cache.has(query)) {
      const results = await Promise.allSettled(libraries.map((find) => find(query)));
      const clips = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const failed = results.find((r) => r.status === "rejected");
      if (!clips.length && failed) throw (failed as PromiseRejectedResult).reason;
      cache.set(query, clips);
    }
    return cache.get(query)!;
  }

  for (const scene of scenes) {
    const query = scene.broll_query?.trim();
    if (!query) continue;
    try {
      const candidates = (await search(query)).filter((c) => !used.has(c.id));
      const pick = candidates.find((c) => c.duration >= Math.min(minSeconds[scene.id] ?? 0, 12)) ?? candidates[0];
      if (!pick) continue;
      used.add(pick.id);
      const file = path.join(dir, `${pick.id}.mp4`);
      if (!fs.existsSync(file)) await download(pick.url, file);
      out[scene.id] = { file: publicPath(file), duration: pick.duration };
    } catch (e) {
      console.log(`  ✗ b-roll for "${query}": ${(e as Error).message}`);
    }
  }
  console.log(`  ✓ ${Object.keys(out).length} clips`);
  return out;
}

/** Full-page screenshots of public web pages, shown as a smooth scroll. */
export async function captureScreenshots(jobId: string, scenes: Scene[]) {
  const out: Record<string, string> = {};
  const targets = scenes.filter((s) => s.kind === "screenshot" && s.url?.startsWith("https://"));
  if (!targets.length) return out;
  console.log("📸 Capturing web pages…");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: config.browserPath || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
    const dir = path.join(jobMediaDir(jobId), "shots");
    fs.mkdirSync(dir, { recursive: true });
    for (const scene of targets) {
      try {
        await page.goto(scene.url!, { waitUntil: "networkidle", timeout: 45_000 });
        // Best effort: dismiss common cookie banners.
        for (const label of ["Accept all", "Accept", "I agree", "Got it", "Allow all"]) {
          await page.getByRole("button", { name: label, exact: true }).first().click({ timeout: 800 }).catch(() => {});
        }
        await page.waitForTimeout(1200);
        const file = path.join(dir, `${hash(scene.url!)}.jpg`);
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const height = Math.min(3200, Math.max(900, pageHeight));
        await page.screenshot({ path: file, type: "jpeg", quality: 85, fullPage: true, clip: { x: 0, y: 0, width: 1600, height } });
        out[scene.id] = publicPath(file);
      } catch (e) {
        console.log(`  ✗ ${scene.url}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}

export function pickMusic(jobId: string): string | null {
  const dir = path.join(ROOT, "assets", "music");
  const tracks = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(mp3|m4a|wav)$/i.test(f)) : [];
  if (!tracks.length) return null;
  const track = tracks[Math.floor(Math.random() * tracks.length)];
  const dest = path.join(jobMediaDir(jobId), `music${path.extname(track)}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(dir, track), dest);
  return publicPath(dest);
}

type WikiPage = {
  title: string;
  imageinfo?: { thumburl?: string; url: string; width: number; height: number; extmetadata?: Record<string, { value: string }> }[];
};

/** Freely licensed photos from Wikimedia Commons (no key needed). */
async function wikimediaImages(query: string): Promise<FoundImage[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10" +
    `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600`;
  const data = await getJson<{ query?: { pages: Record<string, WikiPage> } }>(url, { "user-agent": "ClaudeVideoTeam/1.0 (YouTube studio)" });
  const first = query.toLowerCase().split(/\s+/)[0];
  return Object.values(data.query?.pages ?? {}).flatMap((p) => {
    const info = p.imageinfo?.[0];
    // Must be landscape-ish, big enough, and actually named after the product.
    if (!info || info.width < 900 || info.height > info.width * 1.2 || !p.title.toLowerCase().includes(first)) return [];
    const artist = info.extmetadata?.Artist?.value.replace(/<[^>]+>/g, "").trim() ?? "Unknown";
    const license = info.extmetadata?.LicenseShortName?.value ?? "";
    return [{ url: info.thumburl ?? info.url, source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`, credit: `${artist}, ${license} via Wikimedia Commons` }];
  });
}

async function downloadImage(img: FoundImage, dir: string): Promise<string | null> {
  const file = path.join(dir, `${hash(img.url)}.jpg`);
  if (fs.existsSync(file)) return file;
  try {
    const raw = `${file}.src`;
    await download(img.url, raw, { "user-agent": "Mozilla/5.0 (ClaudeVideoTeam)" });
    await run("ffmpeg", ["-y", "-v", "error", "-i", raw, "-vf", "scale='min(2400,iw)':-2", "-frames:v", "1", "-q:v", "3", file]);
    fs.rmSync(raw, { force: true });
    const [w, h] = (await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]))
      .trim()
      .split(",")
      .map(Number);
    if (w < 800 || h < 400) {
      fs.rmSync(file, { force: true });
      return null; // logos and tiny icons aren't worth showing
    }
    return file;
  } catch {
    return null;
  }
}

/**
 * Real visuals per scene, best first:
 *  1. your own clips/photos from the Telegram library (matched by caption),
 *  2. product photos: Wikimedia Commons, then the hero images of the news articles we researched.
 */
export async function fetchRealVisuals(jobId: string, scenes: Scene[], articleImages: FoundImage[]) {
  const videos: Record<string, { file: string; duration: number }> = {};
  const photos: Record<string, { file: string; credit: string | null }> = {};
  const credits = new Set<string>();
  const dir = path.join(jobMediaDir(jobId), "real");
  fs.mkdirSync(dir, { recursive: true });
  const usedLibrary = new Set<string>();
  const usedImages = new Set<string>();
  const wikiCache = new Map<string, FoundImage[]>();
  const library = async (item: LibraryItem) => {
    const dest = path.join(dir, item.file);
    if (!fs.existsSync(dest)) fs.copyFileSync(await ensureLocal(item), dest);
    return publicPath(dest);
  };

  console.log("📷 Finding real product photos and your own footage…");
  let articlePool = [...articleImages];
  for (const scene of scenes) {
    const text = [scene.product, scene.heading, scene.broll_query, scene.narration].filter(Boolean).join(" ");

    const clip = findInLibrary(text, "video", usedLibrary);
    if (clip) {
      usedLibrary.add(clip.file);
      try {
        videos[scene.id] = { file: await library(clip), duration: clip.duration ?? 5 };
      } catch (e) {
        console.log(`  ✗ ${(e as Error).message}`);
      }
    }

    if (scene.kind !== "product" && !(scene.kind === "broll" && scene.product)) continue;
    const own = findInLibrary(text, "photo", usedLibrary);
    if (own) {
      usedLibrary.add(own.file);
      try {
        photos[scene.id] = { file: await library(own), credit: null };
        continue;
      } catch (e) {
        console.log(`  ✗ ${(e as Error).message}`);
      }
    }
    if (!scene.product) continue;
    if (!wikiCache.has(scene.product)) wikiCache.set(scene.product, await wikimediaImages(scene.product).catch(() => []));
    for (const img of [...wikiCache.get(scene.product)!, ...articlePool]) {
      if (usedImages.has(img.url)) continue;
      usedImages.add(img.url);
      const file = await downloadImage(img, dir);
      if (!file) continue;
      photos[scene.id] = { file: publicPath(file), credit: img.credit };
      credits.add(`${img.credit}: ${img.source}`);
      break;
    }
    articlePool = articlePool.filter((i) => !usedImages.has(i.url));
  }
  console.log(`  ✓ ${Object.keys(photos).length} product photos, ${Object.keys(videos).length} of your own clips`);
  return { videos, photos, credits: [...credits] };
}
