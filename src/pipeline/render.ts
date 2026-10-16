import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { OUT_DIR, PUBLIC_DIR, ROOT, config } from "../config.js";
import type { RenderProps } from "../types.js";
import { probeDuration, run } from "./media.js";

let bundled: string | null = null;
async function getBundle() {
  bundled ??= await bundle({ entryPoint: path.join(ROOT, "src", "video", "index.ts"), publicDir: PUBLIC_DIR });
  return bundled;
}

const browserExecutable = () => config.browserPath || null;

export async function renderVideo(props: RenderProps, name: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const serveUrl = await getBundle();
  const inputProps = props as unknown as Record<string, unknown>;

  console.log("🎬 Rendering video…");
  const composition = await selectComposition({ serveUrl, id: "Video", inputProps, browserExecutable: browserExecutable() });
  const videoFile = path.join(OUT_DIR, `${name}.mp4`);
  let lastPct = -10;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    crf: 20,
    outputLocation: videoFile,
    browserExecutable: browserExecutable(),
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        console.log(`  … ${pct}%`);
      }
    },
  });

  console.log("🖼️  Rendering thumbnail…");
  const thumb = await selectComposition({ serveUrl, id: "Thumbnail", inputProps, browserExecutable: browserExecutable() });
  const thumbFile = path.join(OUT_DIR, `${name}-thumbnail.jpg`);
  await renderStill({ serveUrl, composition: thumb, inputProps, output: thumbFile, imageFormat: "jpeg", jpegQuality: 92, browserExecutable: browserExecutable() });

  return { videoFile, thumbFile };
}

/** A smaller copy that fits Telegram's 50 MB bot upload limit, for watching on your phone. */
export async function makePreview(videoFile: string) {
  if (fs.statSync(videoFile).size < 45 * 1024 * 1024) return videoFile;
  const duration = await probeDuration(videoFile);
  const totalKbps = Math.floor((44 * 8 * 1024) / duration); // aim for ~44 MB
  const videoKbps = Math.max(250, Math.min(2500, totalKbps - 96));
  const out = videoFile.replace(/\.mp4$/, "-preview.mp4");
  await run("ffmpeg", [
    "-y", "-i", videoFile,
    "-vf", `scale=-2:${videoKbps < 700 ? 480 : 720}`,
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${videoKbps}k`, "-maxrate", `${videoKbps}k`, "-bufsize", `${videoKbps * 2}k`,
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out,
  ]);
  return out;
}
