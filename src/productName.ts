/** Product-name matching shared by the pipeline and the video (no Node imports). */

// Product lines whose name doesn't start with the brand.
const BRAND_OF: Record<string, string> = {
  iphone: "apple", ipad: "apple", mac: "apple", macbook: "apple", imac: "apple", airpods: "apple", homepod: "apple", vision: "apple", watch: "apple", airtag: "apple",
  pixel: "google", nest: "google", fitbit: "google", gemini: "google", android: "google",
  galaxy: "samsung",
  surface: "microsoft", xbox: "microsoft", copilot: "microsoft", windows: "microsoft",
  playstation: "sony", ps5: "sony", xperia: "sony",
  chatgpt: "openai", gpt: "openai", sora: "openai",
  claude: "anthropic",
  cybertruck: "tesla", model: "tesla",
  kindle: "amazon", echo: "amazon", alexa: "amazon",
  quest: "meta", rayban: "meta",
  geforce: "nvidia", rtx: "nvidia",
  ryzen: "amd", radeon: "amd",
  thinkpad: "lenovo", legion: "lenovo",
  switch: "nintendo",
};

export const words = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
const GENERIC = new Set(["the", "new", "and", "with", "generation", "gen", "edition", "series", "official", "2nd", "3rd", "1st", "4th", "5th"]);

export function brandOf(product: string) {
  const w = words(product);
  if (!w.length) return null;
  return BRAND_OF[w[0]] ?? w[0];
}

/** Words that identify the product itself (brand and filler removed), e.g. "Apple HomePod mini" → homepod, mini. */
export function coreWords(product: string) {
  const brand = brandOf(product);
  return words(product).filter((w) => w !== brand && !GENERIC.has(w));
}

/** True when the text names the product: every core word appears (letters+digits joined, so "homepod" matches "HomePod"). */
export function mentions(text: string, product: string) {
  const flat = ` ${words(text).join(" ")} `;
  const joined = words(text).join("");
  const core = coreWords(product);
  return core.length > 0 && core.every((w) => flat.includes(` ${w} `) || (w.length >= 5 && joined.includes(w)));
}


// Words that mark a different model in the same family: "HomePod mini" is not the "HomePod".
const VARIANTS = ["mini", "pro", "max", "plus", "ultra", "air", "lite", "se", "fe", "fold", "flip", "xl", "studio", "neo"];

/** True when the text (a page address or photo caption) names a sibling model rather than this product. */
export function otherModel(text: string, product: string) {
  const mine = new Set(words(product));
  return words(text).some((w) => VARIANTS.includes(w) && !mine.has(w));
}
