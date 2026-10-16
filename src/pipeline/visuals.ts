import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, config } from "../config.js";
import { jobMediaDir } from "../jobs.js";
import type { Scene } from "../types.js";
import { download, publicPath } from "./media.js";

type PexelsVideo = {
  id: number;
  duration: number;
  width: number;
  height: number;
  video_files: { link: string; width: number | null; height: number | null; file_type: string; quality: string | null }[];
};

const hash = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

async function pexelsSearch(query: string): Promise<PexelsVideo[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&size=medium&per_page=15`;
  const res = await fetch(url, { headers: { Authorization: config.pexels.apiKey }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  return ((await res.json()) as { videos: PexelsVideo[] }).videos;
}

function bestFile(v: PexelsVideo) {
  // Closest to 1080p, never smaller than 720p.
  return v.video_files
    .filter((f) => f.file_type === "video/mp4" && (f.width ?? 0) >= 1280)
    .sort((a, b) => Math.abs((a.width ?? 0) - 1920) - Math.abs((b.width ?? 0) - 1920))[0];
}

/** Stock b-roll per scene, never reusing the same clip twice in one video. */
export async function fetchBroll(jobId: string, scenes: Scene[], minSeconds: Record<string, number>) {
  const out: Record<string, { file: string; duration: number }> = {};
  if (!config.pexels.apiKey) {
    console.log("🎞️  No Pexels key: scenes will use animated backgrounds instead of stock footage.");
    return out;
  }
  console.log("🎞️  Finding b-roll footage…");
  const dir = path.join(jobMediaDir(jobId), "broll");
  fs.mkdirSync(dir, { recursive: true });
  const used = new Set<number>();
  const cache = new Map<string, PexelsVideo[]>();

  for (const scene of scenes) {
    const query = scene.broll_query?.trim();
    if (!query) continue;
    try {
      if (!cache.has(query)) cache.set(query, await pexelsSearch(query));
      const candidates = cache.get(query)!.filter((v) => !used.has(v.id) && bestFile(v));
      const pick = candidates.find((v) => v.duration >= Math.min(minSeconds[scene.id] ?? 0, 12)) ?? candidates[0];
      if (!pick) continue;
      used.add(pick.id);
      const file = path.join(dir, `pexels-${pick.id}.mp4`);
      if (!fs.existsSync(file)) await download(bestFile(pick)!.link, file);
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
