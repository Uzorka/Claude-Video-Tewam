import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, config } from "../config.js";
import { jobMediaDir } from "../jobs.js";
import { ensureLocal, findInLibrary, type LibraryItem } from "../library.js";
import type { FoundImage, Scene } from "../types.js";
import { download, publicPath, run } from "./media.js";
import { BROWSER_UA, MOBILE_UA, NAME_SHIM, findOfficialMedia, officialMediaEnabled, type OfficialMedia } from "./official.js";

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

const BLOCKED_PAGE =
  /\b(403|404|429|500|502|503)\b.{0,40}(error|forbidden|not found)|access denied|request could not be satisfied|forbidden|captcha|are you a robot|verify you are human|just a moment|enable javascript|unusual traffic|page not found/i;

const STOP = new Set("about after again also because been being but can could does from have here into just like more most much only other over said says some than that their them then there these they this those through very what when where which while will with would your you're it's".split(" "));

/** Words worth matching against the page: names, numbers and longer words from what's being said. */
function keywords(scene: Scene) {
  const text = [scene.narration, scene.heading, scene.subheading].filter(Boolean).join(" ").toLowerCase();
  return [...new Set(text.replace(/[^a-z0-9$.%]+/g, " ").split(" ").map((w) => w.replace(/^[.]+|[.]+$/g, "")))].filter(
    (w) => (w.length >= 4 && !STOP.has(w)) || /\d/.test(w),
  );
}

export type Shot = { file: string; focus: { x: number; y: number; w: number; h: number; aspect: number } | null; host: string };

/**
 * Focused screenshots of public web pages: the paragraph that matches the narration, cropped close and
 * marked so the video can highlight it (instead of scrolling the whole page).
 */
export async function captureScreenshots(jobId: string, scenes: Scene[], vertical = false) {
  const out: Record<string, Shot> = {};
  const targets = scenes.filter((s) => s.kind === "screenshot" && s.url?.startsWith("https://"));
  if (!targets.length) return out;
  console.log("📸 Capturing web pages…");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: config.browserPath || undefined });
  try {
    // A normal desktop browser: "HeadlessChrome" gets blocked by many news sites.
    // Shorts use the phone layout of the page, so the text is big enough to read on a phone.
    const context = await browser.newContext(
      vertical
        ? { userAgent: MOBILE_UA, locale: "en-US", viewport: { width: 430, height: 900 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
        : { userAgent: BROWSER_UA, locale: "en-US", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 },
    );
    await context.addInitScript(NAME_SHIM);
    const page = await context.newPage();
    const dir = path.join(jobMediaDir(jobId), "shots");
    fs.mkdirSync(dir, { recursive: true });
    for (const scene of targets) {
      try {
        const response = await page.goto(scene.url!, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        // Sites often block automated browsers with an error or "verify you are human" page: never film that.
        const visible = (await page.evaluate(() => `${document.title}\n${document.body?.innerText ?? ""}`)).slice(0, 4000);
        if ((response && response.status() >= 400) || BLOCKED_PAGE.test(visible) || visible.replace(/\s+/g, " ").length < 400) {
          console.log(`  ✗ ${scene.url}: blocked or empty page, skipping`);
          continue;
        }
        // Best effort: dismiss cookie banners, then hide anything still floating over the article.
        for (const label of ["Accept all", "Accept All", "Accept", "I agree", "Agree", "Got it", "Allow all", "OK"]) {
          await page.getByRole("button", { name: label, exact: true }).first().click({ timeout: 600 }).catch(() => {});
        }
        await page.waitForTimeout(800);
        const box = await page.evaluate((words: string[]) => {
          for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
            const pos = getComputedStyle(el).position;
            if (pos === "fixed" || pos === "sticky") el.style.setProperty("display", "none", "important");
          }
          const score = (t: string) => {
            const low = t.toLowerCase();
            return words.reduce((n, w) => n + (low.includes(w) ? (/\d/.test(w) ? 3 : 1) : 0), 0);
          };
          let best: HTMLElement | null = null;
          let bestScore = 0;
          for (const el of Array.from(document.querySelectorAll<HTMLElement>("article p, main p, p, li, blockquote, h2, h3"))) {
            const t = el.innerText?.trim() ?? "";
            const r = el.getBoundingClientRect();
            if (t.length < 50 || t.length > 900 || r.width < 300 || r.height < 20) continue;
            const s = score(t);
            if (s > bestScore) [best, bestScore] = [el, s];
          }
          const target = bestScore >= 3 ? best : document.querySelector<HTMLElement>("h1");
          if (!target) return null;
          target.scrollIntoView({ block: "center" });
          const r = target.getBoundingClientRect();
          return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, matched: target !== document.querySelector("h1") };
        }, keywords(scene));
        await page.waitForTimeout(600);
        const file = path.join(dir, `${hash(`${scene.url}#${scene.id}`)}.jpg`);
        let focus: Shot["focus"] = null;
        if (box) {
          // Crop around the passage: some context above and below, never wider than the page.
          const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          const pad = Math.min(70, box.x);
          const x = Math.max(0, box.x - pad);
          const w = Math.min(pageWidth - x, Math.max(720, box.w + pad * 2));
          const h = vertical ? Math.min(900, Math.max(420, box.h + 300)) : Math.min(1400, Math.max(560, box.h + 360));
          const y = Math.max(0, box.y - (h - box.h) / 2);
          await page.screenshot({ path: file, type: "jpeg", quality: 88, fullPage: true, clip: { x, y, width: w, height: h } });
          if (box.matched) focus = { x: (box.x - x) / w, y: (box.y - y) / h, w: box.w / w, h: box.h / h, aspect: w / h };
        } else {
          await page.screenshot({ path: file, type: "jpeg", quality: 88 });
        }
        out[scene.id] = { file: publicPath(file), focus, host: new URL(scene.url!).hostname.replace(/^www\./, "") };
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

/** True when every word of the product name (e.g. "tesla", "roadster", "2") appears in the text. */
function namesProduct(text: string, product: string) {
  const words = new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" "));
  return product
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .every((w) => words.has(w));
}

/**
 * Third-party product photos (Wikimedia, news-article images) are OFF unless PRODUCT_PHOTOS=on:
 * they're often the wrong model or generation, and article images belong to their publishers.
 * Your own photos and clips are always used.
 */
const thirdPartyPhotos = () => (process.env.PRODUCT_PHOTOS ?? "").trim().toLowerCase() === "on";

/** Freely licensed photos from Wikimedia Commons (no key needed). */
async function wikimediaImages(query: string): Promise<FoundImage[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10" +
    `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600`;
  const data = await getJson<{ query?: { pages: Record<string, WikiPage> } }>(url, { "user-agent": "ClaudeVideoTeam/1.0 (YouTube studio)" });
  return Object.values(data.query?.pages ?? {}).flatMap((p) => {
    const info = p.imageinfo?.[0];
    // Must be landscape-ish, big enough, and named after the exact product (every word of it).
    if (!info || info.width < 900 || info.height > info.width * 1.2 || !namesProduct(p.title, query)) return [];
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

/** Official clips are re-encoded small and silent: max 20 s, 1080p, H.264. */
async function downloadVideo(v: FoundImage, dir: string): Promise<{ file: string; duration: number } | null> {
  const file = path.join(dir, `${hash(v.url)}.mp4`);
  try {
    if (!fs.existsSync(file)) {
      const head = await fetch(v.url, { method: "HEAD", headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(15_000) });
      if (Number(head.headers.get("content-length") ?? 0) > 150 * 1024 * 1024) return null;
      const raw = `${file}.src`;
      await download(v.url, raw, { "user-agent": BROWSER_UA });
      await run("ffmpeg", ["-y", "-v", "error", "-i", raw, "-t", "20", "-an", "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", file]);
      fs.rmSync(raw, { force: true });
    }
    const duration = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file])).trim());
    if (!(duration >= 2)) {
      fs.rmSync(file, { force: true });
      return null;
    }
    return { file, duration };
  } catch (e) {
    console.log(`  ✗ video ${v.url}: ${(e as Error).message.split("\n")[0]}`);
    fs.rmSync(file, { force: true });
    return null;
  }
}

/**
 * Real visuals per scene, best first:
 *  1. your own clips/photos from the Telegram library (matched by caption),
 *  2. official photos and clips from the maker's own website (product page, newsroom),
 *  3. (only with PRODUCT_PHOTOS=on) news-article images and Wikimedia Commons.
 * Every scene that names a product gets its photo, so viewers can tie the name to the thing.
 */
export async function fetchRealVisuals(jobId: string, scenes: Scene[], articleImages: FoundImage[]) {
  const videos: Record<string, { file: string; duration: number }> = {};
  const photos: Record<string, { file: string; credit: string | null }> = {};
  const sidePhotos: Record<string, { left: string | null; right: string | null }> = {};
  const credits = new Set<string>();
  const dir = path.join(jobMediaDir(jobId), "real");
  fs.mkdirSync(dir, { recursive: true });
  const usedLibrary = new Set<string>();
  const official = new Map<string, OfficialMedia>();
  const wikiCache = new Map<string, FoundImage[]>();
  // Downloaded photos per product, shown in turn so the same picture isn't repeated scene after scene.
  const gallery = new Map<string, { file: string; credit: string | null; source: string }[]>();
  const shown = new Map<string, number>();
  const library = async (item: LibraryItem) => {
    const dest = path.join(dir, item.file);
    if (!fs.existsSync(dest)) fs.copyFileSync(await ensureLocal(item), dest);
    return publicPath(dest);
  };

  async function officialFor(product: string) {
    if (!officialMediaEnabled()) return { images: [], videos: [], site: null };
    if (!official.has(product)) official.set(product, await findOfficialMedia(product).catch(() => ({ images: [], videos: [], site: null })));
    return official.get(product)!;
  }

  async function photosOf(product: string) {
    if (gallery.has(product)) return gallery.get(product)!;
    const list: { file: string; credit: string | null; source: string }[] = [];
    const add = async (img: FoundImage) => {
      const file = await downloadImage(img, dir);
      if (file && !list.some((l) => l.file === publicPath(file))) list.push({ file: publicPath(file), credit: img.credit, source: img.source });
    };
    for (const img of (await officialFor(product)).images) {
      if (list.length >= 3) break;
      await add(img);
    }
    if (!list.length && thirdPartyPhotos()) {
      // News photos first (they show the current model); only articles that name the exact product.
      if (!wikiCache.has(product)) wikiCache.set(product, await wikimediaImages(product).catch(() => []));
      for (const img of [...articleImages.filter((i) => namesProduct(i.title ?? "", product)), ...wikiCache.get(product)!]) {
        if (list.length >= 2) break;
        await add(img);
      }
    }
    gallery.set(product, list);
    return list;
  }

  async function nextPhoto(product: string, text: string) {
    const own = findInLibrary(`${product} ${text}`, "photo", usedLibrary);
    if (own) {
      try {
        const file = await library(own);
        usedLibrary.add(own.file);
        return { file, credit: null };
      } catch (e) {
        console.log(`  ✗ ${(e as Error).message}`);
      }
    }
    const list = await photosOf(product);
    if (!list.length) return null;
    const n = shown.get(product) ?? 0;
    shown.set(product, n + 1);
    const pick = list[n % list.length];
    if (pick.credit) credits.add(`${pick.credit}: ${pick.source}`);
    return { file: pick.file, credit: pick.credit };
  }

  console.log("📷 Finding official product photos and your own footage…");
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

    // Comparisons of two products: a photo above each column.
    if (scene.kind === "compare" && (scene.left?.product || scene.right?.product)) {
      const side = async (p?: string | null) => (p ? ((await nextPhoto(p, p))?.file ?? null) : null);
      sidePhotos[scene.id] = { left: await side(scene.left?.product), right: await side(scene.right?.product) };
    }

    if (!scene.product) continue;
    // Product scenes: the maker's own video clip is the most engaging shot.
    if ((scene.kind === "product" || scene.kind === "broll") && !videos[scene.id]) {
      for (const v of (await officialFor(scene.product)).videos) {
        if (Object.values(videos).some((x) => x.file.includes(hash(v.url)))) continue;
        const got = await downloadVideo(v, dir);
        if (!got) continue;
        videos[scene.id] = { file: publicPath(got.file), duration: got.duration };
        credits.add(`${v.credit}: ${v.source}`);
        break;
      }
    }
    const photo = await nextPhoto(scene.product, text);
    if (photo) photos[scene.id] = photo;
  }
  const sides = Object.values(sidePhotos).flatMap((s) => [s.left, s.right]).filter(Boolean).length;
  console.log(`  ✓ ${Object.keys(photos).length} product photos, ${sides} comparison photos, ${Object.keys(videos).length} clips`);
  return { videos, photos, sidePhotos, credits: [...credits] };
}
