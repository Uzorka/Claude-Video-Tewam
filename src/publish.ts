import fs from "node:fs";
import { google } from "googleapis";
import { config, requireKeys } from "./config.js";
import type { Job, VideoPlan } from "./types.js";
import { esc, sendMessage, sendPhoto } from "./telegram.js";

const privacy = () => (process.env.PUBLISH_PRIVACY ?? "public").trim() as "public" | "unlisted" | "private";
const disclose = () => (process.env.DISCLOSE_SYNTHETIC ?? "true").trim() !== "false";

/** Upload straight to YouTube. Only goes public once your Google project has passed YouTube's API audit. */
async function uploadToYouTube(plan: VideoPlan, videoFile: string, thumbFile: string) {
  requireKeys("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN");
  const auth = new google.auth.OAuth2(config.youtube.clientId, config.youtube.clientSecret);
  auth.setCredentials({ refresh_token: config.youtube.refreshToken });
  const youtube = google.youtube({ version: "v3", auth });

  console.log("⬆️  Uploading to YouTube…");
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: plan.title,
        description: plan.description,
        tags: plan.tags.slice(0, 15),
        categoryId: "28", // Science & Technology
        defaultLanguage: "en",
        defaultAudioLanguage: "en",
      },
      status: {
        privacyStatus: privacy(),
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: disclose(),
      },
    },
    media: { body: fs.createReadStream(videoFile) },
  });
  const id = res.data.id!;
  try {
    await youtube.thumbnails.set({ videoId: id, media: { mimeType: "image/jpeg", body: fs.createReadStream(thumbFile) } });
  } catch (e) {
    console.log(`  (thumbnail not set - verify your channel by phone to allow custom thumbnails: ${(e as Error).message})`);
  }
  return id;
}

export async function publish(job: Job, plan: VideoPlan, videoFile: string, thumbFile: string, videoUrl: string | null, thumbUrl: string | null) {
  // e.g. the credit line ElevenLabs' free plan requires.
  const footer = (process.env.DESCRIPTION_FOOTER ?? "").trim();
  if (footer) plan = { ...plan, description: `${plan.description}\n\n${footer}` };
  if (config.youtube.publishMode === "api") {
    const id = await uploadToYouTube(plan, videoFile, thumbFile);
    job.youtubeId = id;
    await sendMessage(
      `🚀 <b>Uploaded to YouTube</b> (${privacy()})\n${esc(plan.title)}\nhttps://youtu.be/${id}\n\nStudio: https://studio.youtube.com/video/${id}/edit`,
    );
    return;
  }

  // Manual mode: hand over everything needed for a 2-minute upload in YouTube Studio.
  await sendPhoto(thumbFile, `🖼️ Thumbnail for: <b>${esc(plan.title)}</b>`);
  await sendMessage(
    `✅ <b>Approved: ready to upload</b>

1. Download the full-quality video:
${videoUrl ?? `On your computer: ${videoFile}`}
2. Open https://studio.youtube.com → <b>Create</b> → <b>Upload videos</b>.
3. Copy the title, description and tags from the next messages.
4. Thumbnail: save the image above${thumbUrl ? ` (or ${thumbUrl})` : ""} and upload it.
5. Under "Altered content", choose <b>${disclose() ? "Yes" : "No"}</b>.
6. Publish or schedule it.`,
  );
  await sendMessage(`<b>Title</b> (tap to copy)\n<pre>${esc(plan.title)}</pre>\nOther options:\n${plan.alt_titles.map((t) => `• ${esc(t)}`).join("\n")}`);
  await sendMessage(`<b>Description</b>\n<pre>${esc(plan.description)}</pre>`);
  await sendMessage(`<b>Tags</b>\n<pre>${esc(plan.tags.join(", "))}</pre>`);
}
