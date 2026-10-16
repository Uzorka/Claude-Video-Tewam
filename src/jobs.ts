import fs from "node:fs";
import path from "node:path";
import { JOBS_DIR, PUBLIC_DIR, STATE_DIR } from "./config.js";
import type { Job, Topic, VideoPlan } from "./types.js";

export const jobDir = (id: string) => path.join(JOBS_DIR, id);
export const jobMediaDir = (id: string) => path.join(PUBLIC_DIR, "jobs", id);

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function createJob(topic: Topic): Job {
  const date = new Date().toISOString().slice(0, 10);
  let id = `${date}-${slugify(topic.title)}`;
  for (let n = 2; fs.existsSync(jobDir(id)); n++) id = `${date}-${slugify(topic.title)}-${n}`;
  const now = new Date().toISOString();
  const job: Job = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "researching",
    topic,
    version: 1,
    feedback: [],
    reviewMessageIds: [],
    releaseTag: null,
    fullVideoUrl: null,
    youtubeId: null,
    error: null,
  };
  saveJob(job);
  return job;
}

export function saveJob(job: Job) {
  job.updatedAt = new Date().toISOString();
  writeJson(path.join(jobDir(job.id), "job.json"), job);
}

export const loadJob = (id: string) => readJson<Job>(path.join(jobDir(id), "job.json"));

export function listJobs(): Job[] {
  if (!fs.existsSync(JOBS_DIR)) return [];
  return fs
    .readdirSync(JOBS_DIR)
    .filter((d) => fs.existsSync(path.join(JOBS_DIR, d, "job.json")))
    .map(loadJob)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const savePlan = (id: string, plan: VideoPlan) => writeJson(path.join(jobDir(id), "plan.json"), plan);
export const loadPlan = (id: string) => readJson<VideoPlan>(path.join(jobDir(id), "plan.json"));

export const saveText = (id: string, name: string, text: string) => {
  fs.mkdirSync(jobDir(id), { recursive: true });
  fs.writeFileSync(path.join(jobDir(id), name), text);
};
export const loadText = (id: string, name: string) => fs.readFileSync(path.join(jobDir(id), name), "utf8");

/** Small persistent key/value state (e.g. the Telegram update offset). */
export function readState<T>(name: string, fallback: T): T {
  const file = path.join(STATE_DIR, `${name}.json`);
  return fs.existsSync(file) ? readJson<T>(file) : fallback;
}
export const writeState = (name: string, data: unknown) => writeJson(path.join(STATE_DIR, `${name}.json`), data);
