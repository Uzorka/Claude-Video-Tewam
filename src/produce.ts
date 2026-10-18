import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, PUBLIC_DIR, config } from "./config.js";
import { releaseUrl, downloadRelease, releasesEnabled, tarDir, untar, uploadRelease } from "./github.js";
import { createJob, jobDir, jobMediaDir, listJobs, loadPlan, loadText, saveJob, savePlan, saveText } from "./jobs.js";
import { fmtTime } from "./pipeline/media.js";
import { makePreview, renderVideo } from "./pipeline/render.js";
import { researchTopic } from "./pipeline/research.js";
import { reviseScript, writeScript, writeShort } from "./pipeline/script.js";
import { captureScreenshots, fetchBroll, fetchRealVisuals, pickMusic } from "./pipeline/visuals.js";
import { voiceScenes } from "./pipeline/voice.js";
import { publish } from "./publish.js";
import { esc, sendMessage, sendVideo } from "./telegram.js";
import { demoPlan } from "./demo.js";
import type { FoundImage, Job, RenderProps, RenderScene, Topic, VideoPlan } from "./types.js";

const PAD = 0.3; // breathing room after each line, in seconds
const tagFor = (job: Job) => `video-${job.id}-v${job.version}`;
const outName = (job: Job) => `${job.id}-v${job.version}`;

/** Turn a plan into finished media: voice, footage, render, and the review message. */
export async function produceAndReview(job: Job, plan: VideoPlan) {
  job.status = "producing";
  saveJob(job);

  // On revisions, reuse the previous version's voice clips and footage.
  if (job.version > 1 && !fs.existsSync(jobMediaDir(job.id))) {
    const prev = `video-${job.id}-v${job.version - 1}`;
    if (await downloadRelease(prev, "media.tar.gz", OUT_DIR)) await untar(path.join(OUT_DIR, "media.tar.gz"), path.join(PUBLIC_DIR, "jobs"));
  }

  const voice = await voiceScenes(job.id, plan.scenes);
  const durations = Object.fromEntries(plan.scenes.map((s) => [s.id, voice[s.id].duration + PAD]));
  const imagesFile = path.join(jobDir(job.id), "images.json");
  const articleImages: FoundImage[] = fs.existsSync(imagesFile) ? JSON.parse(fs.readFileSync(imagesFile, "utf8")) : [];
  const real = await fetchRealVisuals(job.id, plan.scenes, articleImages);
  // Your own clips win; stock footage fills the remaining scenes.
  // Stock footage only for general mood shots: a stock search for a specific product returns the wrong one.
  const stock = await fetchBroll(job.id, plan.scenes.filter((s) => !real.videos[s.id] && !s.product), durations);
  const broll = { ...stock, ...real.videos };
  const shots = await captureScreenshots(job.id, plan.scenes, job.format === "vertical");
  saveText(job.id, "credits.txt", real.credits.join("\n"));

  const scenes: RenderScene[] = plan.scenes.map((s) => {
    let kind = s.kind;
    if (kind === "screenshot" && !shots[s.id]) kind = "title";
    // Empty animated scenes fall back to a headline instead of showing nothing.
    if (kind === "process" && !s.steps?.length) kind = "title";
    if (kind === "specs" && !s.specs?.length) kind = "title";
    if (kind === "timeline" && !s.events?.length) kind = "title";
    return {
      ...s,
      kind,
      heading: s.heading ?? (kind === "title" ? s.product : null),
      audio: voice[s.id].file,
      duration: Math.max(2.5, durations[s.id]),
      words: voice[s.id].words,
      broll: broll[s.id]?.file ?? null,
      brollDuration: broll[s.id]?.duration ?? null,
      brollLowRes: "lowRes" in (broll[s.id] ?? {}) ? Boolean((broll[s.id] as { lowRes?: boolean }).lowRes) : false,
      image: shots[s.id]?.file ?? null,
      imageFocus: shots[s.id]?.focus ?? null,
      imageHost: shots[s.id]?.host ?? null,
      sidePhotos: real.sidePhotos[s.id] ?? null,
      photo: real.photos[s.id]?.file ?? null,
      photoCredit: real.photos[s.id]?.credit ?? null,
    };
  });
  const props: RenderProps = {
    channelName: config.channel.name,
    title: plan.title,
    thumbnailText: plan.thumbnail_text,
    vertical: job.format === "vertical",
    scenes,
    music: pickMusic(job.id),
  };

  // Timeline lets feedback like "2:14 fix the price" map to the right scene.
  let t = 0;
  const timeline = scenes
    .map((s) => {
      const line = `${fmtTime(t)} - ${s.id} - ${s.narration.split(/\s+/).slice(0, 10).join(" ")}…`;
      t += s.duration;
      return line;
    })
    .join("\n");
  saveText(job.id, "timeline.txt", timeline);

  const { videoFile, thumbFile } = await renderVideo(props, outName(job));
  const preview = await makePreview(videoFile);

  let videoUrl: string | null = null;
  if (releasesEnabled()) {
    console.log("☁️  Saving files to GitHub Releases…");
    const mediaTar = path.join(OUT_DIR, "media.tar.gz");
    await tarDir(jobMediaDir(job.id), mediaTar);
    await uploadRelease(tagFor(job), `🎬 ${plan.title} (v${job.version})`, `Review build for job ${job.id}.`, [videoFile, thumbFile, mediaTar].filter((f): f is string => Boolean(f)));
    videoUrl = releaseUrl(tagFor(job), videoFile);
  }
  job.releaseTag = releasesEnabled() ? tagFor(job) : null;
  job.fullVideoUrl = videoUrl;

  const caption = `🎬 <b>${esc(plan.title)}</b> (v${job.version}, ${fmtTime(t)})`;
  const ids: number[] = [];
  const videoMsg = await sendVideo(preview, `${caption}\nPreview quality. Full quality link below.`).catch((e) => {
    console.log(`  (preview upload to Telegram failed: ${(e as Error).message})`);
    return null;
  });
  if (videoMsg) ids.push(videoMsg);
  ids.push(
    ...(await sendMessage(
      `${caption}

<b>Why this topic:</b> ${esc(job.topic.why_now)}
<b>Other title ideas:</b>
${plan.alt_titles.map((a) => `• ${esc(a)}`).join("\n")}

${videoUrl ? `▶️ Full quality: ${videoUrl}\n\n` : ""}<b>Reply to this message</b> with:
✅ <code>approve</code> to publish it
✏️ your notes, e.g. <i>"1:20 the price is wrong, it's $799. Make the intro punchier."</i> and I'll send a fixed version
🗑 <code>reject</code> to drop it`,
    )),
  );
  job.reviewMessageIds.push(...ids);
  job.status = "in_review";
  job.error = null;
  saveJob(job);
  console.log(`✅ ${job.id} v${job.version} is ready for review. Files in ${OUT_DIR}`);
}

async function researchScriptProduce(job: Job) {
  const { brief, images } = await researchTopic(job.topic);
  saveText(job.id, "research.md", brief);
  saveText(job.id, "images.json", JSON.stringify(images, null, 2));
  job.status = "scripting";
  saveJob(job);
  const plan = await writeScript(job.topic.title, brief);
  savePlan(job.id, plan);
  saveText(job.id, "script.md", plan.scenes.map((s) => `**[${s.kind}] ${s.id}**\n${s.narration}\n`).join("\n"));
  await produceAndReview(job, plan);
}

export async function makeVideo(topic: Topic) {
  const job = createJob(topic);
  await sendMessage(`🧠 Starting a new video: <b>${esc(topic.title)}</b>\nI'll send it for review in about 30-60 minutes.`);
  try {
    await researchScriptProduce(job);
  } catch (e) {
    await failJob(job, e);
  }
  return job;
}

/** Pick up a failed job from wherever it got to. */
export async function retryJob(job: Job) {
  await sendMessage(`🔁 Retrying <b>${esc(job.topic.title)}</b>…`);
  try {
    if (fs.existsSync(path.join(jobDir(job.id), "plan.json"))) {
      await produceAndReview(job, loadPlan(job.id));
    } else {
      await researchScriptProduce(job);
    }
  } catch (e) {
    await failJob(job, e);
  }
}

export async function reviseJob(job: Job, feedback: string) {
  job.feedback.push({ at: new Date().toISOString(), text: feedback });
  job.status = "revising";
  saveJob(job);
  await sendMessage(`✏️ Got it. Working on v${job.version + 1} of <b>${esc(loadPlan(job.id).title)}</b>…`);
  try {
    const plan = await reviseScript(loadPlan(job.id), loadText(job.id, "research.md"), feedback, loadText(job.id, "timeline.txt"));
    job.version += 1;
    savePlan(job.id, plan);
    await produceAndReview(job, plan);
  } catch (e) {
    await failJob(job, e);
  }
}

export async function approveJob(job: Job) {
  const plan = loadPlan(job.id);
  try {
    const name = outName(job);
    const videoFile = path.join(OUT_DIR, `${name}.mp4`);
    const thumbFile = path.join(OUT_DIR, `${name}-thumbnail.jpg`);
    if (!fs.existsSync(videoFile) && job.releaseTag) await downloadRelease(job.releaseTag, `${name}*`, OUT_DIR);
    const hasThumb = job.format !== "vertical";
    await publish(job, plan, videoFile, hasThumb ? thumbFile : null, job.fullVideoUrl, hasThumb && job.releaseTag ? releaseUrl(job.releaseTag, thumbFile) : null);
    job.status = config.youtube.publishMode === "api" ? "published" : "approved";
  } catch (e) {
    await failJob(job, e);
    return;
  }
  saveJob(job);
}

async function failJob(job: Job, e: unknown) {
  const message = (e as Error).message ?? String(e);
  console.error(e);
  job.status = "failed";
  job.error = message;
  saveJob(job);
  const willRetry = AUTO_RETRY.test(message) && process.env.STUDIO_AUTO_RETRY === "1" && (job.autoRetries ?? 0) < MAX_AUTO_RETRIES;
  const ids = await sendMessage(
    `⚠️ Something went wrong on <b>${esc(job.topic.title)}</b>:\n<code>${esc(message.slice(0, 500))}</code>\n\n${
      willRetry ? "⏳ I'll try again by myself in about 15 minutes. You can also reply <code>retry</code> to try now." : "Reply <code>retry</code> to this message to try again."
    }`,
  ).catch(() => []);
  job.reviewMessageIds.push(...ids);
  saveJob(job);
}

/** Failures caused by a busy or rate-limited AI service are worth retrying later by themselves. */
const AUTO_RETRY = /busy|high demand|overloaded|rate.?limit|quota|503|429|ETIMEDOUT|ECONNRESET|fetch failed/i;
const MAX_AUTO_RETRIES = 3;
const RETRY_AFTER_MS = 15 * 60 * 1000;

/** Quietly retry videos that failed only because a service was busy (laptop serve mode and cloud runs). */
export async function retryBusyJobs() {
  for (const job of listJobs()) {
    if (job.status !== "failed" || !AUTO_RETRY.test(job.error ?? "")) continue;
    if ((job.autoRetries ?? 0) >= MAX_AUTO_RETRIES) continue;
    if (Date.now() - new Date(job.updatedAt).getTime() < RETRY_AFTER_MS) continue;
    job.autoRetries = (job.autoRetries ?? 0) + 1;
    saveJob(job);
    console.log(`🔁 Auto-retry ${job.autoRetries}/${MAX_AUTO_RETRIES}: ${job.topic.title}`);
    await retryJob(job);
    return; // one at a time
  }
}

/** A short sample video in your chosen voice (it can't be revised; it's only for checking the style). */
export async function makeDemo() {
  const job = createJob({ title: "Demo video", angle: "Style preview", why_now: "Testing the studio", score: 0, source_urls: [] });
  job.demo = true;
  savePlan(job.id, demoPlan);
  try {
    await produceAndReview(job, demoPlan);
  } catch (e) {
    await failJob(job, e);
  }
  return job;
}

/**
 * A vertical short (TikTok / Shorts / Reels). Made from an existing video's research and script,
 * or from scratch for a new topic.
 */
export async function makeShort(source: Job | null, topic?: Topic) {
  const job = createJob(source ? { ...source.topic, title: `${source.topic.title} (short)` } : topic!);
  job.format = "vertical";
  job.sourceJobId = source?.id;
  saveJob(job);
  await sendMessage(`📱 Making a vertical short: <b>${esc(job.topic.title)}</b>\nI'll send it in about 10-20 minutes.`);
  try {
    let brief: string;
    if (source && fs.existsSync(path.join(jobDir(source.id), "research.md"))) {
      brief = loadText(source.id, "research.md");
      const images = path.join(jobDir(source.id), "images.json");
      if (fs.existsSync(images)) saveText(job.id, "images.json", fs.readFileSync(images, "utf8"));
    } else {
      const research = await researchTopic(job.topic);
      brief = research.brief;
      saveText(job.id, "images.json", JSON.stringify(research.images, null, 2));
    }
    saveText(job.id, "research.md", brief);
    const fullPlan = source && fs.existsSync(path.join(jobDir(source.id), "plan.json")) ? loadPlan(source.id) : undefined;
    const plan = await writeShort(job.topic.title.replace(/ \(short\)$/, ""), brief, fullPlan);
    savePlan(job.id, plan);
    await produceAndReview(job, plan);
  } catch (e) {
    await failJob(job, e);
  }
  return job;
}
