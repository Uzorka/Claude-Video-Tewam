// Used by the GitHub workflow every 10 minutes: prints "yes" when the studio has work to do
// (new Telegram messages, or a video that failed because a service was busy and is due for a retry),
// so the heavy setup only runs when needed. Plain Node, no packages required.
import fs from "node:fs";

const RETRYABLE = /busy|high demand|overloaded|rate.?limit|quota|503|429|ETIMEDOUT|ECONNRESET|fetch failed/i; // keep in sync with src/produce.ts
let work = false;

let offset = 0;
try {
  offset = JSON.parse(fs.readFileSync("state/telegram.json", "utf8")).offset ?? 0;
} catch {}
try {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=0`);
  const data = await res.json();
  if (!data.ok || data.result.length) work = true;
} catch {
  work = true;
}

for (const dir of fs.existsSync("jobs") ? fs.readdirSync("jobs") : []) {
  try {
    const job = JSON.parse(fs.readFileSync(`jobs/${dir}/job.json`, "utf8"));
    const due = Date.now() - Date.parse(job.updatedAt) >= 15 * 60 * 1000;
    if (job.status === "failed" && RETRYABLE.test(job.error ?? "") && (job.autoRetries ?? 0) < 3 && due) work = true;
  } catch {}
}

console.log(work ? "yes" : "no");
