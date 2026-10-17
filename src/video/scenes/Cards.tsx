import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { brandOf, coreWords, words } from "../../productName";
import type { RenderScene } from "../../types";
import { fadeIn, pop } from "../anim";
import { useVertical } from "../layout";
import { FPS, theme } from "../theme";

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const vertical = useVertical();
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", padding: vertical ? "260px 70px 640px" : "0 160px 140px", fontFamily: theme.font, color: theme.text }}
    >
      {children}
    </AbsoluteFill>
  );
};

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
  const vertical = useVertical();
  return (
    <Center>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: vertical ? 112 : 132, fontWeight: 900, lineHeight: 1.02, letterSpacing: -4, textShadow: "0 10px 60px rgba(0,0,0,0.6)" }}>
          {words.map((w, i) => {
            const p = pop(frame, i * 3);
            return (
              <span key={i} style={{ display: "inline-block", marginRight: vertical ? 22 : 30, opacity: p, transform: `translateY(${(1 - p) * 70}px) rotate(${(1 - p) * 4}deg)` }}>
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
  const vertical = useVertical();
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
            fontSize: vertical ? (shown.length > 5 ? 190 : 250) : 300,
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
  const vertical = useVertical();
  const items = scene.items ?? [];
  const gap = Math.min(30, Math.floor((durationInFrames * 0.6) / Math.max(1, items.length)));
  return (
    <Center>
      <div style={{ width: vertical ? "100%" : 1300 }}>
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
              <div style={{ fontSize: vertical ? 44 : 50, fontWeight: 700 }}>{item}</div>
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
  const vertical = useVertical();
  const col = (side: "left" | "right", data: { label: string; points: string[] } | null, color: string) => {
    const p = pop(frame, side === "left" ? 2 : 10);
    const photo = scene.sidePhotos?.[side];
    const picture = photo && (
      <div
        style={{
          flexShrink: 0,
          width: vertical ? 230 : "100%",
          height: vertical ? 230 : 260,
          marginBottom: vertical ? 0 : 26,
          borderRadius: 20,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Img src={staticFile(photo)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", transform: `scale(${0.9 + pop(frame, side === "left" ? 8 : 16) * 0.1})` }} />
      </div>
    );
    return (
      <div
        style={{
          flex: 1,
          padding: vertical ? 40 : 48,
          borderRadius: 28,
          background: theme.panel,
          border: `2px solid ${color}`,
          backdropFilter: "blur(14px)",
          opacity: p,
          transform: `translateX(${(1 - p) * (side === "left" ? -200 : 200)}px)`,
        }}
      >
        <div style={{ display: "flex", flexDirection: vertical ? "row" : "column", gap: vertical ? 30 : 0, alignItems: vertical ? "center" : "stretch" }}>
          {picture}
          <div>
            <div style={{ fontSize: photo && vertical ? 52 : 60, fontWeight: 900, color, marginBottom: 26 }}>{data?.label}</div>
            {data?.points.map((pt, i) => (
              <div key={i} style={{ fontSize: photo && vertical ? 36 : 42, fontWeight: 600, marginBottom: 16, opacity: fadeIn(frame, 18 + i * 8) }}>
                • {pt}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  return (
    <Center>
      <div style={{ width: vertical ? "100%" : 1500 }}>
        {scene.heading && <div style={{ fontSize: 70, fontWeight: 900, textAlign: "center", marginBottom: 40, letterSpacing: -2, opacity: fadeIn(frame) }}>{scene.heading}</div>}
        <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: vertical ? 24 : 40, alignItems: "stretch" }}>
          {col("left", scene.left, theme.accent2)}
          <div style={{ alignSelf: "center", fontSize: vertical ? 46 : 54, fontWeight: 900, color: theme.muted, transform: `scale(${pop(frame, 16)})` }}>VS</div>
          {col("right", scene.right, theme.accent)}
        </div>
      </div>
    </Center>
  );
};

export const QuoteCard: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  return (
    <Center>
      <div style={{ maxWidth: 1400, textAlign: "center" }}>
        <div style={{ fontSize: 220, lineHeight: 0.6, color: theme.accent, fontWeight: 900, opacity: fadeIn(frame) }}>“</div>
        <div style={{ fontSize: vertical ? 70 : 84, fontWeight: 800, lineHeight: 1.15, letterSpacing: -2, opacity: pop(frame, 4), transform: `scale(${0.92 + pop(frame, 4) * 0.08})` }}>
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
  const vertical = useVertical();
  if (!scene.heading) return null;
  const p = pop(frame, 6);
  return (
    <div style={{ position: "absolute", left: vertical ? 70 : 110, right: vertical ? 70 : undefined, top: vertical ? 260 : 120, fontFamily: theme.font, color: theme.text }}>
      <div style={{ width: 120 * p, height: 8, background: theme.accent, borderRadius: 4, marginBottom: 18 }} />
      <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -2, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, textShadow: "0 6px 40px rgba(0,0,0,0.7)" }}>
        {scene.heading}
      </div>
      {scene.subheading && <div style={{ fontSize: 38, fontWeight: 600, color: "#dfe4f0", marginTop: 8, opacity: fadeIn(frame, 14) }}>{scene.subheading}</div>}
    </div>
  );
};

const EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";

/** "How it works": steps pop in one after another, joined by arrows that draw themselves. */
export const ProcessCard: React.FC<{ scene: RenderScene; durationInFrames: number }> = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const steps = (scene.steps ?? []).slice(0, 5);
  const gap = Math.max(10, Math.min(36, Math.floor((durationInFrames * 0.65) / Math.max(1, steps.length))));
  const size = steps.length > 4 ? 250 : 290;
  if (useVertical()) {
    // Vertical: steps stack downwards, joined by a line that grows between them.
    return (
      <Center>
        <div style={{ width: "100%" }}>
          {scene.heading && <div style={{ fontSize: 66, fontWeight: 900, letterSpacing: -2, marginBottom: 40, textAlign: "center", opacity: fadeIn(frame) }}>{scene.heading}</div>}
          {steps.map((step, i) => {
            const start = 6 + i * gap;
            const p = pop(frame, start);
            const line = interpolate(frame, [start - gap * 0.6, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const active = frame >= start && (i === steps.length - 1 || frame < start + gap);
            return (
              <div key={i}>
                {i > 0 && (
                  <div style={{ marginLeft: 66, width: 8, height: 34, background: theme.stroke, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: `${line * 100}%`, width: "100%", background: theme.accent }} />
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 28,
                    padding: "22px 28px",
                    borderRadius: 26,
                    background: theme.panel,
                    border: `2px solid ${active ? theme.accent2 : theme.stroke}`,
                    boxShadow: active ? "0 0 50px rgba(76,201,240,0.35)" : "none",
                    opacity: p,
                    transform: `translateX(${(1 - p) * -80}px)`,
                  }}
                >
                  <div style={{ fontSize: 80, fontFamily: EMOJI, lineHeight: 1 }}>{step.icon}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: theme.muted }}>STEP {i + 1}</div>
                    <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15 }}>{step.label}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Center>
    );
  }
  return (
    <Center>
      <div style={{ textAlign: "center" }}>
        {scene.heading && <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -2, marginBottom: 60, opacity: fadeIn(frame) }}>{scene.heading}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {steps.map((step, i) => {
            const start = 6 + i * gap;
            const p = pop(frame, start);
            const arrow = interpolate(frame, [start - gap * 0.6, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const active = frame >= start && (i === steps.length - 1 || frame < start + gap);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && (
                  <div style={{ width: 90, height: 8, margin: "0 14px", background: theme.stroke, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${arrow * 100}%`, height: "100%", background: theme.accent }} />
                  </div>
                )}
                <div
                  style={{
                    width: size,
                    padding: "34px 18px",
                    borderRadius: 28,
                    background: theme.panel,
                    border: `2px solid ${active ? theme.accent2 : theme.stroke}`,
                    boxShadow: active ? `0 0 60px rgba(76,201,240,0.35)` : "none",
                    opacity: p,
                    transform: `translateY(${(1 - p) * 60}px) scale(${0.85 + p * 0.15})`,
                  }}
                >
                  <div style={{ fontSize: 96, fontFamily: EMOJI, lineHeight: 1.1 }}>{step.icon}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, marginTop: 18, lineHeight: 1.15 }}>{step.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: theme.muted, marginTop: 10 }}>STEP {i + 1}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Center>
  );
};

/** Spec sheet: rows slide in, values count/fade in, with a sweeping accent bar. */
export const SpecsCard: React.FC<{ scene: RenderScene; durationInFrames: number }> = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const rows = (scene.specs ?? []).slice(0, 6);
  const gap = Math.max(6, Math.min(22, Math.floor((durationInFrames * 0.5) / Math.max(1, rows.length))));
  return (
    <Center>
      <div style={{ width: vertical ? "100%" : 1350 }}>
        {(scene.heading || scene.product) && (
          <div style={{ fontSize: 70, fontWeight: 900, letterSpacing: -2, marginBottom: 34, opacity: fadeIn(frame) }}>{scene.heading ?? scene.product}</div>
        )}
        <div style={{ borderRadius: 26, overflow: "hidden", border: `1px solid ${theme.stroke}`, background: theme.panel }}>
          {rows.map((row, i) => {
            const p = pop(frame, 6 + i * gap);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: vertical ? "24px 30px" : "26px 40px",
                  gap: 20,
                  borderTop: i ? `1px solid ${theme.stroke}` : undefined,
                  opacity: p,
                  transform: `translateX(${(1 - p) * 80}px)`,
                }}
              >
                <div style={{ fontSize: vertical ? 34 : 40, fontWeight: 600, color: theme.muted }}>{row.label}</div>
                <div style={{ fontSize: vertical ? 40 : 48, fontWeight: 900, textAlign: "right", color: i === 0 ? theme.accent2 : theme.text }}>{row.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Center>
  );
};

/** Timeline: a line draws across, dated events pop up along it. */
export const TimelineCard: React.FC<{ scene: RenderScene; durationInFrames: number }> = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const events = (scene.events ?? []).slice(0, 5);
  const line = interpolate(frame, [4, Math.max(20, durationInFrames * 0.6)], [0, 1], { extrapolateRight: "clamp" });
  if (useVertical()) {
    // Vertical: the line grows downwards on the left, events appear beside it.
    return (
      <Center>
        <div style={{ width: "100%" }}>
          {scene.heading && <div style={{ fontSize: 66, fontWeight: 900, letterSpacing: -2, marginBottom: 50, textAlign: "center", opacity: fadeIn(frame) }}>{scene.heading}</div>}
          <div style={{ position: "relative", paddingLeft: 90 }}>
            <div style={{ position: "absolute", left: 30, top: 10, width: 8, height: `calc(${line * 100}% - 20px)`, background: `linear-gradient(180deg, ${theme.accent2}, ${theme.accent})`, borderRadius: 4 }} />
            {events.map((e, i) => {
              const at = events.length === 1 ? 0.5 : i / (events.length - 1);
              const p = interpolate(line, [at - 0.08, at], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ position: "relative", marginBottom: 44, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
                  <div style={{ position: "absolute", left: -74, top: 14, width: 32, height: 32, borderRadius: 16, background: i === events.length - 1 ? theme.accent : theme.accent2 }} />
                  <div style={{ fontSize: 50, fontWeight: 900, color: theme.accent2 }}>{e.date}</div>
                  <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.2 }}>{e.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Center>
    );
  }
  return (
    <Center>
      <div style={{ width: 1560 }}>
        {scene.heading && <div style={{ fontSize: 70, fontWeight: 900, letterSpacing: -2, marginBottom: 90, textAlign: "center", opacity: fadeIn(frame) }}>{scene.heading}</div>}
        <div style={{ position: "relative", height: 330 }}>
          <div style={{ position: "absolute", top: 150, left: 0, height: 8, width: `${line * 100}%`, background: `linear-gradient(90deg, ${theme.accent2}, ${theme.accent})`, borderRadius: 4 }} />
          {events.map((e, i) => {
            const x = events.length === 1 ? 50 : (i / (events.length - 1)) * 100;
            const p = interpolate(line, [x / 100 - 0.05, x / 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const above = i % 2 === 0;
            return (
              <div key={i} style={{ position: "absolute", left: `${x}%`, top: 0, width: 0, height: "100%" }}>
                <div style={{ position: "absolute", top: 140, left: -14, width: 28, height: 28, borderRadius: 14, background: i === events.length - 1 ? theme.accent : theme.accent2, transform: `scale(${p})` }} />
                <div
                  style={{
                    position: "absolute",
                    left: -160,
                    width: 320,
                    textAlign: "center",
                    top: above ? 0 : 200,
                    opacity: p,
                    transform: `translateY(${(1 - p) * (above ? -30 : 30)}px)`,
                  }}
                >
                  <div style={{ fontSize: 46, fontWeight: 900, color: theme.accent2 }}>{e.date}</div>
                  <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, lineHeight: 1.15 }}>{e.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Center>
  );
};

/** Product spotlight without a photo: the name appears in a glowing frame (never a wrong picture). */
export const ProductSpotlight: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const p = pop(frame, 2, 18);
  const glow = 0.35 + Math.sin(frame / 12) * 0.12;
  return (
    <Center>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 8, color: theme.accent, opacity: fadeIn(frame, 0, 12), marginBottom: 24 }}>IN THE SPOTLIGHT</div>
        <div
          style={{
            display: "inline-block",
            padding: vertical ? "44px 50px" : "50px 90px",
            borderRadius: 40,
            border: `3px solid rgba(76,201,240,${glow + 0.3})`,
            boxShadow: `0 0 120px rgba(76,201,240,${glow}), inset 0 0 80px rgba(76,201,240,${glow * 0.4})`,
            background: theme.panel,
            transform: `scale(${0.8 + p * 0.2})`,
            opacity: p,
          }}
        >
          <div style={{ fontSize: vertical ? 96 : 120, fontWeight: 900, letterSpacing: -4, lineHeight: 1.05 }}>{scene.product ?? scene.heading}</div>
          {scene.subheading && <div style={{ fontSize: 42, fontWeight: 600, color: theme.muted, marginTop: 20 }}>{scene.subheading}</div>}
        </div>
      </div>
    </Center>
  );
};

/**
 * The product's official photo pops up the moment its name is said, with the name under it,
 * so viewers can connect the name to the thing ("oh, THAT's the HomePod").
 */
export const ProductReveal: React.FC<{ scene: RenderScene; durationInFrames: number }> = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const product = scene.product!;
  const names = new Set([...coreWords(product), brandOf(product)]);
  const said = scene.words.find((w) => words(w.word).some((x) => names.has(x)));
  const start = Math.max(0, Math.round(((said?.start ?? 0.3) - 0.15) * FPS));
  const length = Math.min(78, durationInFrames - start - 6);
  if (length < 30) return null;
  const local = frame - start;
  if (local < 0 || local > length) return null;
  const p = pop(local, 0, 16);
  const out = interpolate(local, [length - 8, length], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: out, fontFamily: theme.font, color: theme.text }}>
      <AbsoluteFill style={{ background: "rgba(7,8,12,0.78)", opacity: Math.min(1, p * 1.5) }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: vertical ? "300px 60px 620px" : "120px 160px 200px", flexDirection: "column", gap: 34 }}>
        <Img
          src={staticFile(scene.photo!)}
          style={{
            maxWidth: "100%",
            maxHeight: vertical ? 760 : 560,
            objectFit: "contain",
            borderRadius: 26,
            boxShadow: "0 40px 120px rgba(0,0,0,0.7)",
            transform: `scale(${0.85 + p * 0.15}) translateY(${(1 - p) * 40}px)`,
            opacity: p,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: fadeIn(local, 6, 10), transform: `translateY(${(1 - fadeIn(local, 6, 10)) * 20}px)` }}>
          <div style={{ width: 10, height: vertical ? 64 : 58, background: theme.accent, borderRadius: 5 }} />
          <div style={{ fontSize: vertical ? 64 : 60, fontWeight: 900, letterSpacing: -1.5 }}>{product}</div>
        </div>
        {scene.photoCredit && <div style={{ fontSize: 20, color: "rgba(255,255,255,0.55)", marginTop: -14 }}>📷 {scene.photoCredit}</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
