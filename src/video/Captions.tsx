import { useCurrentFrame } from "remotion";
import type { WordTiming } from "../types";
import { useVertical } from "./layout";
import { FPS, theme } from "./theme";

function chunk(words: WordTiming[], max: number) {
  const chunks: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= max || (cur.length >= 3 && /[.?!,;:]$/.test(w.word))) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Word-by-word captions synced to the voice (most viewers watch on mute). */
export const Captions: React.FC<{ words: WordTiming[] }> = ({ words }) => {
  const t = useCurrentFrame() / FPS;
  const vertical = useVertical();
  // Vertical: fewer, bigger words, placed above TikTok's caption area and buttons.
  const chunks = chunk(words, vertical ? 4 : 6);
  const idx = chunks.findIndex((c, i) => t >= c[0].start - 0.05 && t < (chunks[i + 1]?.[0].start ?? c[c.length - 1].end + 0.6));
  if (idx < 0) return null;
  return (
    <div style={{ position: "absolute", left: vertical ? 60 : 0, right: vertical ? 120 : 0, bottom: vertical ? 560 : 84, display: "flex", justifyContent: "center", fontFamily: theme.font }}>
      <div
        style={{
          maxWidth: vertical ? 900 : 1500,
          textAlign: "center",
          fontSize: vertical ? 64 : 54,
          fontWeight: 800,
          lineHeight: 1.25,
          padding: "12px 26px",
          borderRadius: 18,
          background: "rgba(7,8,12,0.55)",
          color: theme.text,
        }}
      >
        {chunks[idx].map((w, i) => {
          const active = t >= w.start && t < w.end + 0.08;
          return (
            <span key={i} style={{ color: active ? theme.accent2 : t >= w.start ? theme.text : "rgba(245,247,251,0.55)", marginRight: 14, display: "inline-block", transform: active ? "scale(1.06)" : undefined }}>
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
