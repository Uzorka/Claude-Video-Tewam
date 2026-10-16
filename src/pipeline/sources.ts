import type { Topic } from "../types.js";

export type SourceArticle = { url: string; title: string; text: string };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

async function get(url: string) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** Rough "reader mode": keep paragraphs and headings, drop scripts, menus and footers. */
export function extractText(html: string) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const blocks = [...body.matchAll(/<(p|h1|h2|h3|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 40);
  return { title, text: blocks.join("\n") };
}

async function bingNews(query: string): Promise<string[]> {
  const xml = await get(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`);
  return [...xml.matchAll(/<item>[\s\S]*?<link>([\s\S]*?)<\/link>/g)].map(([, link]) => {
    const raw = decode(link.trim());
    const real = raw.match(/[?&]url=([^&]+)/)?.[1];
    return real ? decodeURIComponent(real) : raw;
  });
}

async function hnSearch(query: string): Promise<string[]> {
  const data = JSON.parse(await get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5`));
  return data.hits.map((h: { url?: string }) => h.url).filter(Boolean);
}

/**
 * Free research: find recent articles about the topic and download their text,
 * so an AI without built-in web search can still work from real sources.
 */
export async function gatherSources(topic: Topic, max = 8): Promise<SourceArticle[]> {
  const candidates = new Set<string>(topic.source_urls.filter((u) => u.startsWith("http") && !u.includes("news.google.com")));
  for (const finder of [() => bingNews(topic.title), () => hnSearch(topic.title)]) {
    try {
      for (const u of await finder()) candidates.add(u);
    } catch (e) {
      console.log(`  ✗ article search failed: ${(e as Error).message}`);
    }
  }

  const articles: SourceArticle[] = [];
  for (const url of candidates) {
    if (articles.length >= max) break;
    if (/youtube\.com|youtu\.be|twitter\.com|x\.com|reddit\.com|\.pdf$/i.test(url)) continue;
    try {
      const { title, text } = extractText(await get(url));
      if (text.length < 600) continue; // paywalled or empty
      articles.push({ url, title, text: text.slice(0, 7000) });
      console.log(`  ✓ ${title.slice(0, 70) || url}`);
    } catch {
      // unreachable page: skip
    }
  }
  return articles;
}
