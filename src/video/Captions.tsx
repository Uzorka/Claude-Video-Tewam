import { useCurrentFrame } from "remotion";
import type { WordTiming } from "../types";
import { FPS, theme } from "./theme";

function chunk(words: WordTiming[]) {
  const chunks: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 6 || (cur.length >= 3 && /[.?!,;:]$/.test(w.word))) {
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
  const chunks = chunk(words);
  const idx = chunks.findIndex((c, i) => t >= c[0].start - 0.05 && t < (chunks[i + 1]?.[0].start ?? c[c.length - 1].end + 0.6));
  if (idx < 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 84, display: "flex", justifyContent: "center", fontFamily: theme.font }}>
      <div
        style={{
          maxWidth: 1500,
          textAlign: "center",
          fontSize: 54,
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
