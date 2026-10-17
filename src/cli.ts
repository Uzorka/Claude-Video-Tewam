import { config, requireKeys, saveEnv } from "./config.js";
import { readState, writeState } from "./jobs.js";
import { processInbox } from "./inbox.js";
import { findOfficialMedia } from "./pipeline/official.js";
import { scoutTopics } from "./pipeline/trends.js";
import { elevenLabsCredits } from "./pipeline/voice.js";
import { makeDemo, makeShort, makeVideo, retryBusyJobs } from "./produce.js";
import { listJobs } from "./jobs.js";
import { esc, sendMessage } from "./telegram.js";
import type { Topic } from "./types.js";

const [command = "help", ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : process.env[name.toUpperCase()]?.trim() || undefined;
};

async function check() {
  const row = (ok: boolean, label: string, hint: string) => console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : `  ← ${hint}`}`);
  console.log("Checking your studio setup…\n");

  if (config.aiProvider === "gemini") {
    row(Boolean(config.gemini.apiKey), "AI brain: Gemini, free mode (GEMINI_API_KEY)", "required: research and scripts");
  } else {
    row(Boolean(config.anthropic.apiKey), "AI brain: Claude (ANTHROPIC_API_KEY)", "required: research and scripts");
  }
  row(Boolean(config.elevenlabs.apiKey && config.elevenlabs.voiceId), "Voice (ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID)", "required for real voice-over");
  row(Boolean(config.pixabay.apiKey || config.pexels.apiKey), "Stock footage (PIXABAY_API_KEY or PEXELS_API_KEY)", "strongly recommended");
  row(Boolean(config.telegram.botToken), "Telegram bot (TELEGRAM_BOT_TOKEN)", "required for review links");
  row(Boolean(config.telegram.chatId), "Your Telegram chat", "send your bot any message; it connects automatically");
  row(Boolean(config.youtube.apiKey), "YouTube trending data (YOUTUBE_API_KEY)", "optional");
  row(config.youtube.publishMode === "manual" || Boolean(config.youtube.refreshToken), `Publishing mode: ${config.youtube.publishMode}`, "api mode needs YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN");

  if (config.telegram.botToken && !config.telegram.chatId) {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/getUpdates`);
    const data = (await res.json()) as { result?: { message?: { chat: { id: number; first_name?: string } } }[] };
    const chats = new Map((data.result ?? []).filter((u) => u.message).map((u) => [u.message!.chat.id, u.message!.chat.first_name]));
    console.log(
      chats.size
        ? `\n👉 Your TELEGRAM_CHAT_ID is: ${[...chats.entries()].map(([id, name]) => `${id} (${name ?? "?"})`).join(", ")}`
        : "\n👉 Send any message to your bot in Telegram, then run this check again to see your chat ID.",
    );
  }
  if (config.aiProvider === "gemini" && config.gemini.apiKey) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}`, {
      headers: { "x-goog-api-key": config.gemini.apiKey },
    });
    console.log(res.ok ? `\n🧠 Gemini key works (model: ${config.gemini.model}).` : `\n❌ Gemini rejected the key or model (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  if (config.elevenlabs.apiKey) {
    const c = await elevenLabsCredits();
    console.log("error" in c ? `\n❌ ElevenLabs: ${c.error}` : `\n🎙️ ElevenLabs ${c.tier} plan: ${c.used} of ${c.limit} characters used this month (resets ${c.resets ?? "?"}).`);
  }
  if (config.elevenlabs.apiKey) {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": config.elevenlabs.apiKey } });
    if (res.ok) {
      const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; category: string }[] };
      console.log("\n🎙️ Voices on your ElevenLabs account (use the id as ELEVENLABS_VOICE_ID; on the free plan pick one marked premade):");
      for (const v of voices.slice(0, 30)) console.log(`   ${v.voice_id}  ${v.name} (${v.category})`);
    } else console.log(`\n❌ ElevenLabs rejected the API key (${res.status}).`);
  }
  if (config.telegram.botToken && config.telegram.chatId) {
    await sendMessage(`👋 Your studio is connected! Send /help to see what I can do.`);
    console.log("\n📨 Sent a test message to your Telegram.");
  }
}

/** Make a video on your topic, or on today's best trending topic. */
async function autoMake(custom?: string) {
  let topic: Topic;
  if (custom) {
    topic = { title: custom, angle: "As requested by the channel owner.", why_now: "Requested directly by the channel owner.", score: 100, source_urls: [] };
  } else {
    const topics = await scoutTopics(5);
    writeState("last_topics", topics);
    topic = topics[0];
    await sendMessage(
      `🔥 Today's pick: <b>${esc(topic.title)}</b>\n\nRunners-up (send <code>/make 2</code> etc. to make one):\n${topics
        .slice(1)
        .map((t, i) => `${i + 2}. ${esc(t.title)}`)
        .join("\n")}`,
    );
  }
  return makeVideo(topic);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TgPeek = { ok: boolean; description?: string; result?: { update_id: number; message?: { date: number; chat: { id: number; first_name?: string } } }[] };

/** Find your Telegram chat ID automatically: you send the bot a message, we read it. */
async function connectTelegram() {
  requireKeys("TELEGRAM_BOT_TOKEN");
  console.log("\n📱 Open your bot in Telegram and send it any message (for example: hello). Waiting…");
  const since = Math.floor(Date.now() / 1000) - 600;
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/getUpdates`);
    const data = (await res.json()) as TgPeek;
    if (!data.ok) throw new Error(`Telegram says: ${data.description}. Check TELEGRAM_BOT_TOKEN.`);
    const hit = [...(data.result ?? [])].reverse().find((u) => u.message && u.message.date >= since);
    if (hit?.message) {
      const id = String(hit.message.chat.id);
      saveEnv("TELEGRAM_CHAT_ID", id);
      config.telegram.chatId = id;
      writeState("telegram", { offset: hit.update_id + 1 }); // don't treat "hello" as a command later
      await sendMessage(`👋 Hi ${esc(hit.message.chat.first_name ?? "there")}! Your studio is connected. Send /help to see what I can do.`);
      console.log(`✅ Connected! Your chat ID ${id} is saved. Check Telegram for a hello from your bot.`);
      return;
    }
    await sleep(3000);
  }
  throw new Error("No message arrived in 5 minutes. Send your bot a message and run this again.");
}

/** Laptop mode: keep running, answer Telegram within seconds, and (optionally) make a daily video. */
async function serve() {
  requireKeys("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID");
  const dailyHour = Number(process.env.DAILY_HOUR ?? 9);
  console.log("🎬 Your studio is running. Leave this window open (closing it stops the studio).");
  console.log("   Talk to it from Telegram. Press Ctrl+C here to stop.\n");
  await sendMessage("🟢 Studio is online. Send /topics to see what's trending, or /new your topic to make a video.");
  process.env.STUDIO_AUTO_RETRY = "1";
  for (;;) {
    try {
      await processInbox({ quiet: true });
      await retryBusyJobs();
      const today = new Date().toLocaleDateString("en-CA");
      if (process.env.DAILY_VIDEO === "on" && new Date().getHours() >= dailyHour && readState("daily", { last: "" }).last !== today) {
        writeState("daily", { last: today });
        await autoMake();
      }
    } catch (e) {
      console.error(`⚠️  ${(e as Error).message}`);
      await sleep(30_000); // e.g. internet dropped for a moment: wait, then keep going
    }
    await sleep(5_000);
  }
}

async function main() {
  switch (command) {
    case "scout":
    case "topics": {
      const topics = await scoutTopics(5);
      writeState("last_topics", topics);
      topics.forEach((t, i) => console.log(`${i + 1}. [${t.score}] ${t.title}\n   ${t.angle}`));
      await sendMessage(
        `🔥 <b>Trending right now</b>\n\n${topics.map((t, i) => `<b>${i + 1}. ${esc(t.title)}</b> (${t.score})\n${esc(t.angle)}`).join("\n\n")}\n\nSend <code>/make 1</code> (or 2, 3…) to produce one.`,
      );
      break;
    }
    case "make": {
      const job = await autoMake(arg("topic"));
      if (job.status === "failed") process.exitCode = 1;
      break;
    }
    case "inbox":
      await processInbox();
      await retryBusyJobs();
      break;
    case "demo":
      await makeDemo();
      break;
    case "photos": {
      // Preview which official photos and videos the studio finds for a product.
      const product = arg("topic") || "Apple HomePod";
      const media = await findOfficialMedia(product);
      for (const m of [...media.images, ...media.videos]) console.log(`  ${m.url}  (${m.title ?? ""})`);
      if (config.telegram.botToken && config.telegram.chatId) {
        const list = [...media.images.map((m) => `🖼 ${m.url}`), ...media.videos.map((m) => `🎞 ${m.url}`)].slice(0, 9);
        await sendMessage(`🔎 <b>Official media for ${esc(product)}</b>\n${media.site ? `From ${esc(media.site)}\n\n` : ""}${list.length ? esc(list.join("\n")) : "Nothing found."}`).catch(() => {});
      }
      break;
    }
    case "short": {
      // A vertical short of your topic, or of the latest finished video.
      const custom = arg("topic");
      const source = [...listJobs()].reverse().find((j) => !j.demo && j.format !== "vertical" && ["in_review", "approved", "published"].includes(j.status));
      const job = custom
        ? await makeShort(null, { title: custom, angle: "As requested by the channel owner.", why_now: "Requested directly by the channel owner.", score: 100, source_urls: [] })
        : source
          ? await makeShort(source)
          : null;
      if (!job) console.log("No finished video to shorten. Use --topic.");
      else if (job.status === "failed") process.exitCode = 1;
      break;
    }
    case "check":
      await check();
      break;
    case "connect-telegram":
      await connectTelegram();
      break;
    case "serve":
      await serve();
      break;
    default:
      console.log('Commands: check | topics | make [--topic "..."] | short [--topic "..."] | inbox | demo | serve | connect-telegram');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
