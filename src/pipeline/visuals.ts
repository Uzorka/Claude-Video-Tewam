import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, config } from "../config.js";
import { jobMediaDir } from "../jobs.js";
import type { Scene } from "../types.js";
import { download, publicPath } from "./media.js";

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
