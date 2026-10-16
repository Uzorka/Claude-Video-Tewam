import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { RenderScene } from "../../types";
import { fadeIn, pop } from "../anim";
import { theme } from "../theme";

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 160px 140px", fontFamily: theme.font, color: theme.text }}>
    {children}
  </AbsoluteFill>
);

const Kicker: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, delay);
  return (
    <div
      style={{
        display: "inline-block",
        padding: "10px 22px",
        borderRadius: 999,
        background: theme.accent,
        fontSize: 30,
        fontWeight: 800,
        letterSpacing: 2,
        textTransform: "uppercase",
        transform: `scale(${p})`,
        marginBottom: 30,
      }}
    >
      {text}
    </div>
  );
};

/** Big kinetic headline: words fly in one by one. */
export const TitleCard: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const words = (scene.heading ?? "").split(" ");
  return (
    <Center>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 132, fontWeight: 900, lineHeight: 1.02, letterSpacing: -4, textShadow: "0 10px 60px rgba(0,0,0,0.6)" }}>
          {words.map((w, i) => {
            const p = pop(frame, i * 3);
            return (
              <span key={i} style={{ display: "inline-block", marginRight: 30, opacity: p, transform: `translateY(${(1 - p) * 70}px) rotate(${(1 - p) * 4}deg)` }}>
                {w}
              </span>
            );
          })}
        </div>
        {scene.subheading && (
          <div style={{ marginTop: 36, fontSize: 44, fontWeight: 600, color: theme.muted, opacity: fadeIn(frame, words.length * 3 + 6) }}>
            {scene.subheading}
          </div>
        )}
      </div>
    </Center>
  );
};

/** One huge number that counts up. */
export const StatCard: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const raw = scene.stat_value ?? "";
  const m = raw.match(/^(\D*)([\d,.]+)(.*)$/);
  const progress = interpolate(frame, [4, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
  let shown = raw;
  if (m) {
    const target = Number(m[2].replace(/,/g, ""));
    const decimals = (m[2].split(".")[1] ?? "").length;
    const value = (target * progress).toFixed(decimals);
    shown = m[1] + (m[2].includes(",") ? Number(value).toLocaleString("en-US", { minimumFractionDigits: decimals }) : value) + m[3];
  }
  return (
    <Center>
      <div style={{ textAlign: "center" }}>
        {scene.heading && <Kicker text={scene.heading} />}
        <div
          style={{
            fontSize: 300,
            fontWeight: 900,
            letterSpacing: -10,
            lineHeight: 1,
            transform: `scale(${0.8 + pop(frame, 0) * 0.2})`,
            background: `linear-gradient(180deg, #ffffff 0%, ${theme.muted} 100%)`,
            WebkitBackgroundClip: "text",
            color: "transparent",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {shown}
        </div>
        {scene.subheading && <div style={{ fontSize: 48, fontWeight: 600, color: theme.muted, marginTop: 20, opacity: fadeIn(frame, 20) }}>{scene.subheading}</div>}
      </div>
    </Center>
  );
};

/** Bullet points revealed one at a time. */
export const ListCard: React.FC<{ scene: RenderScene; durationInFrames: number }> = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const items = scene.items ?? [];
  const gap = Math.min(30, Math.floor((durationInFrames * 0.6) / Math.max(1, items.length)));
  return (
    <Center>
      <div style={{ width: 1300 }}>
        {scene.heading && <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -2, marginBottom: 40, opacity: fadeIn(frame) }}>{scene.heading}</div>}
        {items.map((item, i) => {
          const p = pop(frame, 8 + i * gap);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 30,
                marginBottom: 22,
                padding: "26px 34px",
                borderRadius: 22,
                background: theme.panel,
                border: `1px solid ${theme.stroke}`,
                backdropFilter: "blur(14px)",
                opacity: p,
                transform: `translateX(${(1 - p) * -120}px)`,
              }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 16, background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 900, flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ fontSize: 50, fontWeight: 700 }}>{item}</div>
            </div>
          );
        })}
      </div>
    </Center>
  );
};

/** Two columns that slide in from either side. */
export const CompareCard: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const col = (side: "left" | "right", data: { label: string; points: string[] } | null, color: string) => {
    const p = pop(frame, side === "left" ? 2 : 10);
    return (
      <div
        style={{
          flex: 1,
          padding: 48,
          borderRadius: 28,
          background: theme.panel,
          border: `2px solid ${color}`,
          backdropFilter: "blur(14px)",
          opacity: p,
          transform: `translateX(${(1 - p) * (side === "left" ? -200 : 200)}px)`,
        }}
      >
        <div style={{ fontSize: 60, fontWeight: 900, color, marginBottom: 26 }}>{data?.label}</div>
        {data?.points.map((pt, i) => (
          <div key={i} style={{ fontSize: 42, fontWeight: 600, marginBottom: 16, opacity: fadeIn(frame, 18 + i * 8) }}>
            • {pt}
          </div>
        ))}
      </div>
    );
  };
  return (
    <Center>
      <div style={{ width: 1500 }}>
        {scene.heading && <div style={{ fontSize: 70, fontWeight: 900, textAlign: "center", marginBottom: 40, letterSpacing: -2, opacity: fadeIn(frame) }}>{scene.heading}</div>}
        <div style={{ display: "flex", gap: 40, alignItems: "stretch" }}>
          {col("left", scene.left, theme.accent2)}
          <div style={{ alignSelf: "center", fontSize: 54, fontWeight: 900, color: theme.muted, transform: `scale(${pop(frame, 16)})` }}>VS</div>
          {col("right", scene.right, theme.accent)}
        </div>
      </div>
    </Center>
  );
};

export const QuoteCard: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  return (
    <Center>
      <div style={{ maxWidth: 1400, textAlign: "center" }}>
        <div style={{ fontSize: 220, lineHeight: 0.6, color: theme.accent, fontWeight: 900, opacity: fadeIn(frame) }}>“</div>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.15, letterSpacing: -2, opacity: pop(frame, 4), transform: `scale(${0.92 + pop(frame, 4) * 0.08})` }}>
          {scene.heading}
        </div>
        {scene.subheading && <div style={{ marginTop: 34, fontSize: 40, color: theme.muted, fontWeight: 600, opacity: fadeIn(frame, 18) }}>— {scene.subheading}</div>}
      </div>
    </Center>
  );
};

/** Label shown over full-screen footage. */
export const LowerThird: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  if (!scene.heading) return null;
  const p = pop(frame, 6);
  return (
    <div style={{ position: "absolute", left: 110, top: 120, fontFamily: theme.font, color: theme.text }}>
      <div style={{ width: 120 * p, height: 8, background: theme.accent, borderRadius: 4, marginBottom: 18 }} />
      <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -2, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, textShadow: "0 6px 40px rgba(0,0,0,0.7)" }}>
        {scene.heading}
      </div>
      {scene.subheading && <div style={{ fontSize: 38, fontWeight: 600, color: "#dfe4f0", marginTop: 8, opacity: fadeIn(frame, 14) }}>{scene.subheading}</div>}
    </div>
  );
};
