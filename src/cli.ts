import { config } from "./config.js";
import { createJob, writeState } from "./jobs.js";
import { demoPlan } from "./demo.js";
import { processInbox } from "./inbox.js";
import { scoutTopics } from "./pipeline/trends.js";
import { makeVideo, produceAndReview } from "./produce.js";
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

  row(Boolean(config.anthropic.apiKey), "Claude (ANTHROPIC_API_KEY)", "required: research and scripts");
  row(Boolean(config.elevenlabs.apiKey && config.elevenlabs.voiceId), "Voice (ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID)", "required for real voice-over");
  row(Boolean(config.pexels.apiKey), "Stock footage (PEXELS_API_KEY)", "strongly recommended");
  row(Boolean(config.telegram.botToken), "Telegram bot (TELEGRAM_BOT_TOKEN)", "required for review links");
  row(Boolean(config.telegram.chatId), "Your Telegram chat (TELEGRAM_CHAT_ID)", "see below");
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
  if (config.elevenlabs.apiKey) {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": config.elevenlabs.apiKey } });
    if (res.ok) {
      const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; category: string }[] };
      console.log("\n🎙️ Voices on your ElevenLabs account (use the id as ELEVENLABS_VOICE_ID):");
      for (const v of voices.slice(0, 30)) console.log(`   ${v.voice_id}  ${v.name} (${v.category})`);
    } else console.log(`\n❌ ElevenLabs rejected the API key (${res.status}).`);
  }
  if (config.telegram.botToken && config.telegram.chatId) {
    await sendMessage(`👋 Your studio is connected! Send /help to see what I can do.`);
    console.log("\n📨 Sent a test message to your Telegram.");
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
      const custom = arg("topic");
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
      const job = await makeVideo(topic);
      if (job.status === "failed") process.exitCode = 1;
      break;
    }
    case "inbox":
      await processInbox();
      break;
    case "demo": {
      const job = createJob({ title: "Demo video", angle: "Style preview", why_now: "Testing the studio", score: 0, source_urls: [] });
      await produceAndReview(job, demoPlan);
      break;
    }
    case "check":
      await check();
      break;
    default:
      console.log("Commands: check | topics | make [--topic \"...\"] | inbox | demo");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
