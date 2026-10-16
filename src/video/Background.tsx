import { AbsoluteFill, Img, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { RenderScene } from "../types";
import { FPS, theme } from "./theme";

/** Animated gradient + grid used when there's no footage. */
export const Backdrop: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS + seed * 7;
  const x1 = 30 + Math.sin(t * 0.25) * 20;
  const y1 = 30 + Math.cos(t * 0.2) * 15;
  const x2 = 70 + Math.cos(t * 0.22) * 20;
  const y2 = 70 + Math.sin(t * 0.18) * 15;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${x1}% ${y1}%, rgba(255,59,92,0.35), transparent 45%),
          radial-gradient(circle at ${x2}% ${y2}%, rgba(76,201,240,0.28), transparent 50%), ${theme.bg}`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          backgroundPosition: `0px ${(frame * 0.6) % 80}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Stock footage with a slow push-in, looped if the clip is shorter than the scene. */
export const Footage: React.FC<{ scene: RenderScene; durationInFrames: number; dim: number; blur?: number }> = ({
  scene,
  durationInFrames,
  dim,
  blur = 0,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [1.04, 1.14]);
  const clipFrames = Math.max(FPS, Math.floor((scene.brollDuration ?? durationInFrames / FPS) * FPS) - 2);
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: theme.bg }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, filter: blur ? `blur(${blur}px)` : undefined }}>
        <Loop durationInFrames={clipFrames}>
          <OffthreadVideo src={staticFile(scene.broll!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Loop>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(7,8,12,${dim * 0.75}) 0%, rgba(7,8,12,${dim * 0.65}) 50%, rgba(7,8,12,${Math.min(1, dim + 0.25)}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Scrolling capture of a web page inside a browser frame. */
export const PageScroll: React.FC<{ src: string; durationInFrames: number }> = ({ src, durationInFrames }) => {
  const frame = useCurrentFrame();
  // object-position scrolls a tall capture from top to bottom whatever its height.
  const y = interpolate(frame, [15, durationInFrames - 10], [0, 60], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 260,
        right: 260,
        top: 120,
        bottom: 200,
        borderRadius: 22,
        overflow: "hidden",
        border: `1px solid ${theme.stroke}`,
        boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        background: "#fff",
      }}
    >
      <div style={{ height: 44, background: "#1c1f2a", display: "flex", alignItems: "center", gap: 10, paddingLeft: 18 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
      </div>
      <Img src={staticFile(src)} style={{ width: "100%", height: "calc(100% - 44px)", objectFit: "cover", objectPosition: `50% ${y}%` }} />
    </div>
  );
};
