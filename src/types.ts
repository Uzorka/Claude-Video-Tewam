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

export const VISUAL_KINDS = ["broll", "product", "title", "stat", "list", "compare", "quote", "screenshot"] as const;

export const SceneSchema = z.object({
  id: z.string().describe("Short slug, unique within the video, e.g. 'hook' or 'price'"),
  narration: z
    .string()
    .describe("Exactly what the voice says in this scene. Spoken English, 1-4 sentences."),
  kind: z.enum(VISUAL_KINDS).describe(
    "broll = full-screen stock video; product = a real photo of the product with its name on screen; title = big kinetic headline; stat = one big number; list = 2-5 bullet points revealed one by one; compare = two columns side by side; quote = a quote with attribution; screenshot = scrolling capture of a public web page",
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
    .object({ label: z.string(), points: z.array(z.string()) })
    .nullable()
    .describe("For kind=compare: left column"),
  right: z
    .object({ label: z.string(), points: z.array(z.string()) })
    .nullable()
    .describe("For kind=compare: right column"),
  url: z.string().nullable().describe("For kind=screenshot: a public https URL to capture"),
  product: z
    .string()
    .nullable()
    .describe("The exact product this scene is about, e.g. 'iPhone 18 Pro' or 'Galaxy S26 Ultra'. Required for kind=product; also set it on other scenes about one specific product."),
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
  image: string | null; // screenshot path relative to public/
  photo: string | null; // real product photo path relative to public/
  photoCredit: string | null;
};

export type RenderProps = {
  channelName: string;
  title: string;
  thumbnailText: string;
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
export type FoundImage = { url: string; source: string; credit: string };

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
};
