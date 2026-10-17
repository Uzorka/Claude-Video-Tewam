import type { FoundImage } from "../types.js";
import { config } from "../config.js";
import { brandOf, coreWords, mentions, otherModel } from "../productName.js";

/**
 * Official product media: press/marketing photos and clips the maker publishes on its own website
 * (e.g. apple.com/homepod or Apple Newsroom). Manufacturers publish these for news coverage and reviews;
 * they're always credited in the description. Set OFFICIAL_MEDIA=off to turn this off.
 */
export const officialMediaEnabled = () => (process.env.OFFICIAL_MEDIA ?? "").trim().toLowerCase() !== "off";

export type OfficialMedia = { images: FoundImage[]; videos: FoundImage[]; site: string | null };

/** tsx compiles helper functions with esbuild's __name(); code sent into the browser needs it defined there too. */
export const NAME_SHIM = { content: "globalThis.__name = globalThis.__name || ((f) => f);" };

export const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
export const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function getText(url: string) {
  const res = await fetch(url, { headers: { "user-agent": BROWSER_UA, "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.text();
}

async function bingWeb(query: string): Promise<string[]> {
  const xml = await getText(`https://www.bing.com/search?format=rss&count=20&q=${encodeURIComponent(query)}`);
  return [...xml.matchAll(/<item>[\s\S]*?<link>([\s\S]*?)<\/link>/g)].map(([, l]) => decode(l.trim()));
}

async function duckDuckGo(query: string): Promise<string[]> {
  const html = await getText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  return [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)].map(([, href]) => {
    const h = decode(href);
    const real = h.match(/[?&]uddg=([^&]+)/)?.[1];
    return real ? decodeURIComponent(real) : h;
  });
}

/** Pages on the maker's own website about this product: product page and newsroom/press release. */
export async function officialPages(product: string): Promise<string[]> {
  const brand = brandOf(product);
  if (!brand) return [];
  const onBrandSite = (u: string) => {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      // apple.com, store.google.com, news.samsung.com, blog.google… but not "applesupport-fans.net".
      return host.split(".").includes(brand) && !/support|community|forum|discussions|developer|investor/.test(u);
    } catch {
      return false;
    }
  };
  const found: string[] = [];
  const core = coreWords(product).join(" ");
  for (const query of [`${product} official site`, `site:${brand}.com ${core}`, `${product} newsroom press release`]) {
    for (const search of [bingWeb, duckDuckGo]) {
      try {
        const links = (await search(query)).filter(onBrandSite);
        if (links.length) {
          found.push(...links.slice(0, 3));
          break;
        }
      } catch (e) {
        console.log(`  (search: ${(e as Error).message})`);
      }
    }
  }
  return [...new Set(found)].slice(0, 6);
}

type PageMedia = { title: string; images: { url: string; area: number; alt: string }[]; videos: string[]; links: { href: string; text: string }[] };

/** Load each official page in a real browser and collect its big product images and videos. */
export async function findOfficialMedia(product: string): Promise<OfficialMedia> {
  const empty: OfficialMedia = { images: [], videos: [], site: null };
  if (!coreWords(product).length) return empty;
  const pages = await officialPages(product);
  if (!pages.length) {
    console.log(`  · no official page found for "${product}"`);
    return empty;
  }
  const brand = brandOf(product)!;
  const company = brand.charAt(0).toUpperCase() + brand.slice(1);
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: config.browserPath || undefined });
  const result: OfficialMedia = { images: [], videos: [], site: null };
  try {
    const context = await browser.newContext({ userAgent: BROWSER_UA, locale: "en-US", viewport: { width: 1600, height: 1000 } });
    await context.addInitScript(NAME_SHIM);
    const page = await context.newPage();
    // The usual product page address first (apple.com/homepod, apple.com/iphone-17-pro), then search results.
    const queue = [`https://www.${brandOf(product)}.com/${coreWords(product).join("-")}/`, ...pages];
    const visited = new Set<string>();
    for (let n = 0; queue.length && n < 8; n++) {
      const url = queue.shift()!;
      if (visited.has(url.replace(/[#?].*$/, "")) || /support|applecare|account\./i.test(url)) continue;
      visited.add(url.replace(/[#?].*$/, ""));
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
        await page.waitForTimeout(2500);
        // Scroll a little so lazy-loaded hero images and videos appear.
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, 900);
          await page.waitForTimeout(500);
        }
        const media: PageMedia = await page.evaluate(() => {
          const meta = (p: string) => document.querySelector<HTMLMetaElement>(`meta[property="${p}"], meta[name="${p}"]`)?.content ?? "";
          const images: { url: string; area: number; alt: string }[] = [];
          const og = meta("og:image") || meta("twitter:image");
          if (og) images.push({ url: new URL(og, location.href).href, area: 1e9, alt: meta("og:title") || document.title });
          for (const img of Array.from(document.images)) {
            const r = img.getBoundingClientRect();
            const src = img.currentSrc || img.src;
            if (!src || src.startsWith("data:") || img.naturalWidth < 900 || r.width < 400) continue;
            images.push({ url: src, area: r.width * r.height, alt: img.alt || "" });
          }
          // Press releases link full-resolution downloads.
          for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
            if (/\.(jpe?g|png)(\?|$)/i.test(a.href) && /download|full|large|hi-?res/i.test(`${a.textContent} ${a.href}`)) images.push({ url: a.href, area: 5e8, alt: a.textContent ?? "" });
          }
          const videos = Array.from(document.querySelectorAll("video"))
            .flatMap((v) => [v.currentSrc, v.src, ...Array.from(v.querySelectorAll("source")).map((s) => s.src)])
            .concat(Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href$='.mp4'], a[href*='.mp4?']")).map((a) => a.href))
            .filter((s) => s && /\.mp4(\?|$)/i.test(s) && !s.startsWith("blob:"));
          const h1 = document.querySelector("h1")?.textContent ?? "";
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => ({ href: a.href.split("#")[0], text: `${a.textContent ?? ""} ${a.getAttribute("aria-label") ?? ""}` }));
          return { title: `${document.title} ${h1} ${meta("og:title")} ${location.pathname.replace(/[/_-]+/g, " ")}`, images, videos, links };
        });
        // Only pages that are about this exact product. From a homepage or store page, follow its links to the product.
        if (!mentions(media.title, product) || otherModel(new URL(page.url()).pathname, product)) {
          const host = new URL(url).hostname;
          const next = media.links
            .filter((l) => {
              const u = new URL(l.href);
              const about = mentions(u.pathname.replace(/[/_-]+/g, " "), product) || mentions(l.text, product);
              return u.hostname === host && !visited.has(l.href.replace(/[#?].*$/, "")) && about && !otherModel(u.pathname, product) && !/support|applecare|account|login|sign/i.test(l.href);
            })
            .sort((a, b) => a.href.length - b.href.length)
            .map((l) => l.href);
          if (next.length) queue.unshift(...[...new Set(next)].slice(0, 2));
          console.log(`  · ${url}: not about ${product}${next.length ? `, following ${next[0]}` : ", skipping"}`);
          continue;
        }
        result.site ??= url;
        const credit = `${company} (official)`;
        for (const img of media.images.sort((a, b) => b.area - a.area).filter((i) => !otherModel(i.alt, product))) {
          if (!result.images.some((i) => i.url === img.url)) result.images.push({ url: img.url, source: url, credit, title: img.alt });
        }
        for (const v of new Set(media.videos)) {
          if (!result.videos.some((i) => i.url === v)) result.videos.push({ url: v, source: url, credit });
        }
      } catch (e) {
        console.log(`  · ${url}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  } finally {
    await browser.close();
  }
  // Press b-roll (newsroom downloads) first: clean product shots without music or text.
  result.videos.sort((a, b) => Number(/newsroom|press|download/i.test(b.url + b.source)) - Number(/newsroom|press|download/i.test(a.url + a.source)));
  result.images = result.images.slice(0, 6);
  result.videos = result.videos.slice(0, 3);
  console.log(`  ✓ ${product}: ${result.images.length} official images, ${result.videos.length} videos${result.site ? ` from ${result.site}` : ""}`);
  return result;
}
