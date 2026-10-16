import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { PUBLIC_DIR } from "../config.js";

const execFileAsync = promisify(execFile);

export async function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts });
  return stdout;
}

export async function probeDuration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Number(out.trim());
}

/** Path the Remotion video uses to reference a file inside public/. */
export const publicPath = (file: string) => path.relative(PUBLIC_DIR, file).split(path.sep).join("/");

export async function download(url: string, outFile: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`);
  const fs = await import("node:fs");
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
