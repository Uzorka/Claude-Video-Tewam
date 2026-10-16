import { config } from "../config.js";
import { structured } from "../claude.js";
import { listJobs } from "../jobs.js";
import { TopicListSchema, type Topic } from "../types.js";

type Signal = { source: string; title: string; url?: string; heat?: string };

async function fetchText(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (uzorka-media-studio)", ...headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function rssTitles(xml: string, source: string, limit: number): Signal[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
  const pick = (block: string, tag: string) =>
    block
      .match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, "")
      .trim();
  return items.map(([, block]) => ({
    source,
    title: pick(block, "title") ?? "",
    url: pick(block, "link"),
    heat: pick(block, "ht:approx_traffic"),
  }));
}

const sources: Record<string, () => Promise<Signal[]>> = {
  async hackerNews() {
    const data = JSON.parse(await fetchText("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40"));
    return data.hits.map((h: { title: string; url?: string; points: number; num_comments: number }) => ({
      source: "Hacker News",
      title: h.title,
      url: h.url,
      heat: `${h.points} points, ${h.num_comments} comments`,
    }));
  },
  async reddit() {
    const subs = "technology+artificial+OpenAI+singularity+gadgets+Android+apple+hardware";
    const data = JSON.parse(await fetchText(`https://www.reddit.com/r/${subs}/top.json?t=day&limit=40`));
    return data.data.children.map((c: { data: { title: string; subreddit: string; ups: number; url: string } }) => ({
      source: `Reddit r/${c.data.subreddit}`,
      title: c.data.title,
      url: c.data.url,
      heat: `${c.data.ups} upvotes`,
    }));
  },
  async googleNews() {
    const q = encodeURIComponent("(AI OR smartphone OR Apple OR Samsung OR Google OR OpenAI OR Nvidia) when:2d");
    return rssTitles(await fetchText(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`), "Google News", 40);
  },
  async googleTrends() {
    return rssTitles(await fetchText("https://trends.google.com/trending/rss?geo=US"), "Google Trends (US searches)", 30);
  },
  async youtubeTrending() {
    if (!config.youtube.apiKey) return [];
    const url =
      "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&videoCategoryId=28&regionCode=US&maxResults=30&key=" +
      config.youtube.apiKey;
    const data = JSON.parse(await fetchText(url));
    return data.items.map(
      (v: { id: string; snippet: { title: string; channelTitle: string }; statistics: { viewCount: string } }) => ({
        source: `YouTube trending (Science & Tech) - ${v.snippet.channelTitle}`,
        title: v.snippet.title,
        url: `https://youtube.com/watch?v=${v.id}`,
        heat: `${v.statistics.viewCount} views`,
      }),
    );
  },
};

export async function gatherSignals(): Promise<Signal[]> {
  const results = await Promise.allSettled(Object.entries(sources).map(async ([name, fn]) => ({ name, items: await fn() })));
  const signals: Signal[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      console.log(`  ✓ ${r.value.name}: ${r.value.items.length} signals`);
      signals.push(...r.value.items.filter((s) => s.title));
    } else {
      console.log(`  ✗ trend source failed: ${r.reason}`);
    }
  }
  return signals;
}

/** Find and rank the best video topics right now. */
export async function scoutTopics(count = 5): Promise<Topic[]> {
  console.log("🔎 Scouting trends…");
  const signals = await gatherSignals();
  if (!signals.length) throw new Error("No trend sources responded. Check the network and try again.");

  const recent = listJobs()
    .slice(-30)
    .map((j) => `- ${j.topic.title}`)
    .join("\n");

  const { topics } = await structured(
    TopicListSchema,
    `You are the head of content for "${config.channel.name}", a YouTube channel about ${config.channel.niche}.
You pick topics the way MKBHD, Mrwhosetheboss and Mr Mobile's teams would: stories a broad tech audience is actively curious about this week, where a ${config.channel.targetMinutes}-minute explainer can add real value (context, comparison, what it means for the viewer).
Prefer: new AI model/tool launches, major product launches and leaks, big industry moves, "is X worth it" questions, surprising tech trends.
Avoid: politics, tragedies, rumors from a single weak source, niche developer-only news, and topics already covered recently.`,
    `Here are today's raw trend signals (source | title | heat | url):
${signals.map((s) => `${s.source} | ${s.title} | ${s.heat ?? ""} | ${s.url ?? ""}`).join("\n")}

Topics already covered recently (do not repeat these):
${recent || "(none yet)"}

Group related signals into stories and return the ${count} best video topics, best first. Score each 0-100 on: audience interest (40), momentum across multiple sources (30), fit with the channel (20), how much a video can add beyond headlines (10).`,
    "medium",
  );
  return topics.sort((a, b) => b.score - a.score).slice(0, count);
}
