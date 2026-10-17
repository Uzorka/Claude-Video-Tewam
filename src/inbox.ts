import os from "node:os";
import path from "node:path";
import { config, updateSettings } from "./config.js";
import { addToLibrary, loadLibrary, parseTags } from "./library.js";
import { listJobs, loadPlan, readState, writeState } from "./jobs.js";
import { scoutTopics } from "./pipeline/trends.js";
import { approveJob, makeDemo, makeVideo, retryJob, reviseJob } from "./produce.js";
import { elevenLabsCredits } from "./pipeline/voice.js";
import { downloadTelegramFile, esc, getUpdates, sendMessage, type TgMessage } from "./telegram.js";
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
• <code>/demo</code> – a short sample video to check the style and voice
• <code>/voices</code> – list voices, then <code>/voice ID</code> to switch
• <code>/library</code> – your own photos and clips

📷 <b>Your own footage:</b> send me photos or short videos with a caption saying what they show, e.g. <i>iphone 18, unboxing</i>. Whenever a video talks about that, I'll use your shots first.`;

const APPROVE = /^(approve|approved|yes|publish|go|ship it|looks good|lgtm|✅|👍)[.!]*$/i;
const REJECT = /^(reject|rejected|drop|skip|no|cancel|🗑️?|👎)[.!]*$/i;
const RETRY = /^(retry|try again)[.!]*$/i;

function findJob(msg: TgMessage, jobs: Job[]): Job | undefined {
  const replyId = msg.reply_to_message?.message_id;
  if (replyId) {
    const hit = jobs.find((j) => j.reviewMessageIds.includes(replyId));
    if (hit) return hit;
  }
  // Not a reply: assume the most recent real video waiting for you (never the sample demo).
  return [...jobs].reverse().find((j) => !j.demo && j.topic.title !== "Demo video" && (j.status === "in_review" || j.status === "failed"));
}

async function listVoices() {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": config.elevenlabs.apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs rejected the request (${res.status}). Check ELEVENLABS_API_KEY.`);
  return ((await res.json()) as { voices: { voice_id: string; name: string; category: string }[] }).voices;
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
    if (!msg) continue;
    // No TELEGRAM_CHAT_ID set: the first person to message the bot privately becomes its owner.
    if (!config.telegram.chatId && msg.chat.type === "private") {
      updateSettings({ ownerChatId: String(msg.chat.id) });
      tasks.push(() => sendMessage(`👋 Connected! This chat now controls your studio.\n\n${HELP}`));
      continue;
    }
    if (String(msg.chat.id) !== config.telegram.chatId) continue; // ignore strangers
    // Photos and clips you send become part of your footage library.
    const media = msg.photo?.length
      ? { id: msg.photo[msg.photo.length - 1].file_id, kind: "photo" as const, size: msg.photo[msg.photo.length - 1].file_size ?? 0 }
      : msg.video
        ? { id: msg.video.file_id, kind: "video" as const, size: msg.video.file_size ?? 0 }
        : msg.document && /^(image|video)\//.test(msg.document.mime_type ?? "")
          ? { id: msg.document.file_id, kind: msg.document.mime_type!.startsWith("image") ? ("photo" as const) : ("video" as const), size: msg.document.file_size ?? 0 }
          : null;
    if (media) {
      const tags = parseTags(msg.caption ?? "");
      tasks.push(async () => {
        if (!tags.length) return void (await sendMessage("📷 Please send it again with a caption saying what it shows, e.g. <i>iphone 18, unboxing</i>.", msg.message_id));
        if (media.size > 20 * 1024 * 1024)
          return void (await sendMessage("That file is over 20 MB, the limit for bots. Send it as a normal video (not as a file) so Telegram compresses it, or trim it shorter.", msg.message_id));
        const tmp = path.join(os.tmpdir(), `tg-${media.id.slice(-12)}`);
        await downloadTelegramFile(media.id, tmp);
        const item = await addToLibrary(tmp, media.kind, tags);
        await sendMessage(`✅ Saved to your library as <b>${esc(tags.join(", "))}</b> (${item.type}${item.duration ? `, ${Math.round(item.duration)}s` : ""}). I'll use it when a video mentions that.`, msg.message_id);
      });
      continue;
    }

    const text = (msg.text ?? msg.caption ?? "").trim();
    if (!text) continue;
    console.log(`📨 "${text.slice(0, 80)}"`);

    const jobs = listJobs();
    if (/^\/(start|help)\b/i.test(text)) {
      tasks.push(() => sendMessage(HELP));
    } else if (/^\/demo\b/i.test(text)) {
      tasks.push(async () => {
        await sendMessage("🎬 Making a short sample video. It takes about 5 minutes…");
        await makeDemo();
      });
    } else if (/^\/library\b/i.test(text)) {
      tasks.push(async () => {
        const items = loadLibrary();
        if (!items.length) return void (await sendMessage("Your library is empty. Send me photos or short videos with a caption like <i>iphone 18</i>."));
        const byTag = new Map<string, number>();
        for (const i of items) for (const t of i.tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
        await sendMessage(
          `📚 <b>Your library</b>: ${items.filter((i) => i.type === "photo").length} photos, ${items.filter((i) => i.type === "video").length} clips\n\n${[...byTag]
            .map(([t, n]) => `• ${esc(t)} (${n})`)
            .join("\n")}`,
        );
      });
    } else if (/^\/voices\b/i.test(text)) {
      tasks.push(async () => {
        const voices = await listVoices();
        const premade = voices.filter((v) => v.category === "premade");
        const other = voices.filter((v) => v.category !== "premade");
        await sendMessage(
          `🎙️ <b>Voices you can use on the free plan</b> (tap an ID to copy it):\n\n${premade
            .map((v) => `• ${esc(v.name)}\n<code>${v.voice_id}</code>`)
            .join("\n")}${other.length ? `\n\n<i>Voices marked cloned/professional/library need a paid plan.</i>` : ""}\n\nThen send: <code>/voice ID</code>\nCurrent voice: <code>${esc(config.elevenlabs.voiceId || "none")}</code>`,
        );
      });
    } else if (/^\/voice\s+\S+/i.test(text)) {
      const id = text.split(/\s+/)[1];
      tasks.push(async () => {
        const voice = (await listVoices()).find((v) => v.voice_id === id);
        if (!voice) return void (await sendMessage("I couldn't find that voice ID on your ElevenLabs account. Send /voices to see the list."));
        updateSettings({ voiceId: id });
        await sendMessage(`✅ Voice changed to <b>${esc(voice.name)}</b>. Send /demo to hear it.`);
      });
    } else if (!msg.reply_to_message && /^(hi|hello|hey|yo|hiya|thanks|thank you|ok|okay|cool|nice|good (morning|afternoon|evening))[!. ]*$/i.test(text)) {
      tasks.push(() => sendMessage("👋 Hi! I'm here. Send /new followed by a topic to make a video, or /help to see everything I can do."));
    } else if (/^\/status\b/i.test(text)) {
      const active = jobs.filter((j) => !["published", "rejected", "approved"].includes(j.status));
      tasks.push(async () => {
        const c = await elevenLabsCredits();
        const voice = "error" in c ? `\n\n🎙️ ${esc(c.error)}` : `\n\n🎙️ Voice credits: ${c.used} of ${c.limit} characters used (${c.tier} plan, resets ${c.resets ?? "?"}).`;
        await sendMessage(
          (active.length ? active.map((j) => `• <b>${esc(j.topic.title)}</b> – ${j.status} (v${j.version})`).join("\n") : "Nothing in progress. Send /topics or /new.") + voice,
        );
      });
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
  for (const task of tasks) {
    try {
      await task();
    } catch (e) {
      console.error(`⚠️  ${(e as Error).message}`);
      await sendMessage(`⚠️ ${esc((e as Error).message)}`).catch(() => {});
    }
  }
}
