import { z } from "zod";

export const TopicSchema = z.object({
  title: z.string().describe("Working title of the video idea"),
  angle: z.string().describe("The specific take that makes this video worth watching"),
  why_now: z.string().describe("Why this is trending right now, citing the signals"),
  score: z.number().describe("0-100 overall pick score"),
  source_urls: z.array(z.string()),
});
export const TopicListSchema = z.object({ topics: z.array(TopicSchema) });
export type Topic = z.infer<typeof TopicSchema>;

export const VISUAL_KINDS = ["broll", "product", "process", "specs", "timeline", "title", "stat", "list", "compare", "quote", "screenshot"] as const;

const CompareProduct = z
  .string()
  .nullable()
  .optional()
  .describe("When this column is a specific product: its exact official name, e.g. 'Apple HomePod mini' (its official photo is shown above the column). Otherwise null.");

export const SceneSchema = z.object({
  id: z.string().describe("Short slug, unique within the video, e.g. 'hook' or 'price'"),
  narration: z
    .string()
    .describe("Exactly what the voice says in this scene. Spoken English, 1-4 sentences."),
  kind: z.enum(VISUAL_KINDS).describe(
    "broll = full-screen stock video of a GENERAL scene (never a specific product); product = the product's name presented on screen (with the owner's own photo if one exists); process = animated how-it-works diagram of 2-5 steps; specs = animated spec sheet; timeline = animated timeline of dated events; title = big kinetic headline; stat = one big number; list = 2-5 bullet points revealed one by one; compare = two columns side by side; quote = a quote with attribution; screenshot = close-up of the paragraph on a public web page that backs up what's being said, highlighted",
  ),
  broll_query: z
    .string()
    .nullable()
    .describe("2-4 word stock-footage search for kind=broll (and as a background for other kinds), e.g. 'smartphone close up'"),
  heading: z
    .string()
    .nullable()
    .describe("Main on-screen text, max 6 words. For kind=quote this is the quote itself (max 20 words)."),
  subheading: z
    .string()
    .nullable()
    .describe("Secondary on-screen text, max 10 words. For kind=quote: who said it."),
  stat_value: z.string().nullable().describe("For kind=stat: the number, e.g. '$999' or '3.5x'"),
  items: z.array(z.string()).nullable().describe("For kind=list: 2-5 short bullet points"),
  left: z
    .object({ label: z.string(), points: z.array(z.string()), product: CompareProduct })
    .nullable()
    .describe("For kind=compare: left column"),
  right: z
    .object({ label: z.string(), points: z.array(z.string()), product: CompareProduct })
    .nullable()
    .describe("For kind=compare: right column"),
  url: z.string().nullable().describe("For kind=screenshot: a public https URL to capture"),
  steps: z
    .array(z.object({ icon: z.string().describe("One emoji, e.g. 🔋 ⚙️ 🚀 📱"), label: z.string().describe("2-5 words") }))
    .nullable()
    .describe("For kind=process: 2-5 steps that explain how something works, in order"),
  specs: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .nullable()
    .describe("For kind=specs: 3-6 rows, e.g. {label:'0-60 mph', value:'0.81 s'}"),
  events: z
    .array(z.object({ date: z.string().describe("e.g. '2017' or 'Oct 2026'"), label: z.string().describe("max 6 words") }))
    .nullable()
    .describe("For kind=timeline: 3-5 dated events in order"),
  product: z
    .string()
    .nullable()
    .describe(
      "The exact official name (with brand) of the ONE product this scene talks about, e.g. 'Apple HomePod mini' or 'Samsung Galaxy S26 Ultra'. Its official photo pops up when the name is said, so set it on EVERY scene (any kind) that names or discusses a specific product. Required for kind=product. Null when no single product is discussed.",
    ),
});
export type Scene = z.infer<typeof SceneSchema>;

export const VideoPlanSchema = z.object({
  title: z.string().describe("YouTube title, under 70 characters, curiosity without clickbait lies"),
  alt_titles: z.array(z.string()).describe("3 alternative titles to A/B test"),
  thumbnail_text: z.string().describe("2-4 punchy words for the thumbnail"),
  description: z.string().describe("YouTube description with a 2-line summary and a Sources section listing URLs"),
  tags: z.array(z.string()),
  scenes: z.array(SceneSchema),
});
export type VideoPlan = z.infer<typeof VideoPlanSchema>;

export type WordTiming = { word: string; start: number; end: number };

/** What the renderer needs per scene once audio and visuals exist. */
export type RenderScene = Scene & {
  audio: string | null; // path relative to public/
  duration: number; // seconds
  words: WordTiming[]; // relative to scene start
  broll: string | null; // video path relative to public/
  brollDuration: number | null; // seconds of footage available
  /** Footage below HD (e.g. a 360p YouTube clip): shown as a framed card instead of stretched full screen. */
  brollLowRes?: boolean;
  image: string | null; // screenshot path relative to public/
  /** Where the matching passage sits in the screenshot (fractions 0-1), to zoom in and highlight it. */
  imageFocus: { x: number; y: number; w: number; h: number; aspect: number } | null;
  imageHost: string | null;
  /** Official photos above the two columns of a product comparison. */
  sidePhotos: { left: string | null; right: string | null } | null;
  photo: string | null; // real product photo path relative to public/
  photoCredit: string | null;
};

export type RenderProps = {
  channelName: string;
  title: string;
  thumbnailText: string;
  /** true = 1080x1920 vertical video for TikTok / YouTube Shorts / Reels. */
  vertical?: boolean;
  scenes: RenderScene[];
  music: string | null;
};

export type JobStatus =
  | "researching"
  | "scripting"
  | "producing"
  | "in_review"
  | "revising"
  | "approved"
  | "published"
  | "rejected"
  | "failed";

/** A real image found for the topic (article hero images, Wikimedia Commons). */
export type FoundImage = { url: string; source: string; credit: string; title?: string };

export type Job = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  topic: Topic;
  version: number;
  feedback: { at: string; text: string }[];
  reviewMessageIds: number[];
  releaseTag: string | null;
  fullVideoUrl: string | null;
  youtubeId: string | null;
  error: string | null;
  autoRetries?: number;
  demo?: boolean;
  /** "vertical" = TikTok / Shorts format. */
  format?: "landscape" | "vertical";
  /** For a short made from a longer video: that video's job id. */
  sourceJobId?: string;
};
