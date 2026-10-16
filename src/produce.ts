import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, PUBLIC_DIR, config } from "./config.js";
import { releaseUrl, downloadRelease, releasesEnabled, tarDir, untar, uploadRelease } from "./github.js";
import { createJob, jobDir, jobMediaDir, loadPlan, loadText, saveJob, savePlan, saveText } from "./jobs.js";
import { fmtTime } from "./pipeline/media.js";
import { makePreview, renderVideo } from "./pipeline/render.js";
import { researchTopic } from "./pipeline/research.js";
import { reviseScript, writeScript } from "./pipeline/script.js";
import { captureScreenshots, fetchBroll, pickMusic } from "./pipeline/visuals.js";
import { voiceScenes } from "./pipeline/voice.js";
import { publish } from "./publish.js";
import { esc, sendMessage, sendVideo } from "./telegram.js";
import type { Job, RenderProps, RenderScene, Topic, VideoPlan } from "./types.js";

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
  const broll = await fetchBroll(job.id, plan.scenes, durations);
  const shots = await captureScreenshots(job.id, plan.scenes);

  const scenes: RenderScene[] = plan.scenes.map((s) => ({
    ...s,
    kind: s.kind === "screenshot" && !shots[s.id] ? "title" : s.kind,
    audio: voice[s.id].file,
    duration: Math.max(2.5, durations[s.id]),
    words: voice[s.id].words,
    broll: broll[s.id]?.file ?? null,
    brollDuration: broll[s.id]?.duration ?? null,
    image: shots[s.id] ?? null,
  }));
  const props: RenderProps = {
    channelName: config.channel.name,
    title: plan.title,
    thumbnailText: plan.thumbnail_text,
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
    await uploadRelease(tagFor(job), `🎬 ${plan.title} (v${job.version})`, `Review build for job ${job.id}.`, [videoFile, thumbFile, mediaTar]);
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
  const brief = await researchTopic(job.topic);
  saveText(job.id, "research.md", brief);
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
    await publish(job, plan, videoFile, thumbFile, job.fullVideoUrl, job.releaseTag ? releaseUrl(job.releaseTag, thumbFile) : null);
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
  const ids = await sendMessage(
    `⚠️ Something went wrong on <b>${esc(job.topic.title)}</b>:\n<code>${esc(message.slice(0, 500))}</code>\n\nReply <code>retry</code> to this message to try again.`,
  ).catch(() => []);
  job.reviewMessageIds.push(...ids);
  saveJob(job);
}
