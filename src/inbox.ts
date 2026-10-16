import { config } from "./config.js";
import { demoPlan } from "./demo.js";
import { createJob, listJobs, loadPlan, readState, writeState } from "./jobs.js";
import { scoutTopics } from "./pipeline/trends.js";
import { approveJob, makeVideo, produceAndReview, retryJob, reviseJob } from "./produce.js";
import { esc, getUpdates, sendMessage, type TgMessage } from "./telegram.js";
import type { Job, Topic } from "./types.js";

const HELP = `🤖 <b>How to talk to your studio</b>

Reply to a review message with:
• <code>approve</code> – publish that video
• <code>reject</code> – drop it
• any notes – I'll fix it and send a new version (timestamps like 1:20 help)
• <code>retry</code> – try again after an error

Commands:
• <code>/topics</code> – today's best trending topics
• <code>/make 2</code> – make topic #2 from the last /topics list
• <code>/new your topic here</code> – make a video on any topic you choose
• <code>/status</code> – what's in progress
• <code>/demo</code> – a short sample video to check the style and voice`;

const APPROVE = /^(approve|approved|yes|publish|go|ship it|looks good|lgtm|✅|👍)[.!]*$/i;
const REJECT = /^(reject|rejected|drop|skip|no|cancel|🗑️?|👎)[.!]*$/i;
const RETRY = /^(retry|try again)[.!]*$/i;

function findJob(msg: TgMessage, jobs: Job[]): Job | undefined {
  const replyId = msg.reply_to_message?.message_id;
  if (replyId) {
    const hit = jobs.find((j) => j.reviewMessageIds.includes(replyId));
    if (hit) return hit;
  }
  // Not a reply: assume the most recent video waiting for you.
  return [...jobs].reverse().find((j) => j.status === "in_review" || j.status === "failed");
}

function customTopic(text: string): Topic {
  return { title: text, angle: "As requested by the channel owner.", why_now: "Requested directly by the channel owner.", score: 100, source_urls: [] };
}

/** Read your Telegram replies and act on them. */
export async function processInbox({ quiet = false } = {}) {
  const state = readState("telegram", { offset: 0 });
  const updates = await getUpdates(state.offset);
  if (!updates.length) {
    if (!quiet) console.log("📭 No new messages.");
    return;
  }

  const tasks: (() => Promise<unknown>)[] = [];
  for (const u of updates) {
    state.offset = u.update_id + 1;
    const msg = u.message;
    if (!msg || String(msg.chat.id) !== config.telegram.chatId) continue; // ignore strangers
    const text = (msg.text ?? msg.caption ?? "").trim();
    if (!text) continue;
    console.log(`📨 "${text.slice(0, 80)}"`);

    const jobs = listJobs();
    if (/^\/(start|help)\b/i.test(text)) {
      tasks.push(() => sendMessage(HELP));
    } else if (/^\/demo\b/i.test(text)) {
      tasks.push(async () => {
        await sendMessage("🎬 Making a short sample video. It takes about 5 minutes…");
        const job = createJob({ title: "Demo video", angle: "Style preview", why_now: "Requested from Telegram", score: 0, source_urls: [] });
        await produceAndReview(job, demoPlan);
      });
    } else if (/^\/status\b/i.test(text)) {
      const active = jobs.filter((j) => !["published", "rejected", "approved"].includes(j.status));
      tasks.push(() =>
        sendMessage(active.length ? active.map((j) => `• <b>${esc(j.topic.title)}</b> – ${j.status} (v${j.version})`).join("\n") : "Nothing in progress. Send /topics or /new."),
      );
    } else if (/^\/topics\b/i.test(text)) {
      tasks.push(async () => {
        const topics = await scoutTopics(5);
        writeState("last_topics", topics);
        await sendMessage(
          `🔥 <b>Trending right now</b>\n\n${topics.map((t, i) => `<b>${i + 1}. ${esc(t.title)}</b> (${t.score})\n${esc(t.angle)}`).join("\n\n")}\n\nSend <code>/make 1</code> (or 2, 3…) to produce one.`,
        );
      });
    } else if (/^\/make\s+\d+/i.test(text)) {
      const n = Number(text.match(/\d+/)![0]);
      const topic = readState<Topic[]>("last_topics", [])[n - 1];
      tasks.push(() => (topic ? makeVideo(topic) : sendMessage("I don't have that topic. Send /topics first.")));
    } else if (/^\/new\s+\S/i.test(text)) {
      tasks.push(() => makeVideo(customTopic(text.replace(/^\/new\s+/i, ""))));
    } else {
      const job = findJob(msg, jobs);
      if (!job) {
        tasks.push(() => sendMessage(`I'm not sure which video that's about. Reply directly to a review message.\n\n${HELP}`));
      } else if (APPROVE.test(text)) {
        tasks.push(() => approveJob(job));
      } else if (REJECT.test(text)) {
        job.status = "rejected";
        tasks.push(async () => {
          const { saveJob } = await import("./jobs.js");
          saveJob(job);
          await sendMessage(`🗑 Dropped <b>${esc(job.topic.title)}</b>.`);
        });
      } else if (RETRY.test(text) || job.status === "failed") {
        tasks.push(() => retryJob(job));
      } else if (job.status === "in_review") {
        tasks.push(() => reviseJob(job, text));
      } else {
        tasks.push(() => sendMessage(`<b>${esc(loadPlan(job.id).title)}</b> is currently "${job.status}", so I can't change it now.`));
      }
    }
  }
  // Save the offset first so a crash never makes us re-handle the same message forever.
  writeState("telegram", state);
  for (const task of tasks) await task();
}
