import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";
import { probeDuration, run } from "./pipeline/media.js";

/**
 * Your own photos and clips, sent to the bot on Telegram with a caption like "iphone 18".
 * Whenever a video talks about something matching a caption, your footage is used first.
 */
export const LIBRARY_DIR = path.join(ROOT, "assets", "library");
const INDEX = path.join(LIBRARY_DIR, "index.json");

export type LibraryItem = { file: string; type: "photo" | "video"; tags: string[]; duration: number | null; added: string };

export function loadLibrary(): LibraryItem[] {
  return fs.existsSync(INDEX) ? (JSON.parse(fs.readFileSync(INDEX, "utf8")) as LibraryItem[]) : [];
}

const saveLibrary = (items: LibraryItem[]) => {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  fs.writeFileSync(INDEX, JSON.stringify(items, null, 2) + "\n");
};

/** "iPhone 18, unboxing; desk" → ["iphone 18", "unboxing", "desk"] */
export const parseTags = (caption: string) =>
  caption
    .toLowerCase()
    .split(/[,;\n#]+/)
    .map((t) => t.replace(/[^a-z0-9 .+-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1);

/** Normalise any photo/clip into something the video engine always plays well. */
export async function addToLibrary(srcFile: string, kind: "photo" | "video", tags: string[]) {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  const base = `${Date.now()}`;
  let file: string;
  let duration: number | null = null;
  if (kind === "photo") {
    file = path.join(LIBRARY_DIR, `${base}.jpg`);
    await run("ffmpeg", ["-y", "-v", "error", "-i", srcFile, "-vf", "scale='min(2400,iw)':-2", "-q:v", "3", file]);
  } else {
    // 1080p landscape, H.264, no sound. Vertical phone clips get a blurred background instead of being cropped.
    file = path.join(LIBRARY_DIR, `${base}.mp4`);
    await run("ffmpeg", [
      "-y", "-v", "error", "-i", srcFile,
      "-filter_complex",
      "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=20:2[bg];[0:v]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p",
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", file,
    ]);
    duration = await probeDuration(file);
  }
  const items = loadLibrary();
  items.push({ file: path.basename(file), type: kind, tags, duration, added: new Date().toISOString() });
  saveLibrary(items);
  return items[items.length - 1];
}

/** A tag matches when all of its words appear in the scene's text (e.g. "iphone 18" ↔ "Is the iPhone 18 worth it?"). */
export function findInLibrary(sceneText: string, type: "photo" | "video", exclude: Set<string>) {
  const words = new Set(sceneText.toLowerCase().replace(/[^a-z0-9 .+-]/g, " ").split(/\s+/));
  const matches = (tag: string) => tag.split(" ").every((w) => words.has(w));
  return loadLibrary().find((item) => item.type === type && !exclude.has(item.file) && item.tags.some(matches)) ?? null;
}
