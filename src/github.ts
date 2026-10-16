import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { run } from "./pipeline/media.js";

/** Rendered files live in GitHub Releases (free, up to 2 GB per file) so they survive between runs. */
export const releasesEnabled = () => Boolean(config.github.token && config.github.repo);

const gh = (args: string[]) =>
  run("gh", [...args, "--repo", config.github.repo], { env: { ...process.env, GH_TOKEN: config.github.token } });

export const releaseUrl = (tag: string, file: string) =>
  `https://github.com/${config.github.repo}/releases/download/${tag}/${path.basename(file)}`;

export async function uploadRelease(tag: string, title: string, notes: string, files: string[]) {
  if (!releasesEnabled()) return false;
  await gh(["release", "create", tag, ...files, "--title", title, "--notes", notes, "--prerelease"]);
  return true;
}

export async function downloadRelease(tag: string, pattern: string, dir: string) {
  if (!releasesEnabled()) return false;
  fs.mkdirSync(dir, { recursive: true });
  try {
    await gh(["release", "download", tag, "--pattern", pattern, "--dir", dir, "--clobber"]);
    return true;
  } catch (e) {
    console.log(`  (could not download ${pattern} from ${tag}: ${(e as Error).message.split("\n")[0]})`);
    return false;
  }
}

export async function tarDir(dir: string, outFile: string) {
  await run("tar", ["-czf", outFile, "-C", path.dirname(dir), path.basename(dir)]);
}

export async function untar(file: string, destParent: string) {
  fs.mkdirSync(destParent, { recursive: true });
  await run("tar", ["-xzf", file, "-C", destParent]);
}
