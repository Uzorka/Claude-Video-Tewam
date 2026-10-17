import { AbsoluteFill, Img, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { RenderScene } from "../types";
import { useVertical } from "./layout";
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

/**
 * A close-up of the passage on a web page that backs up what's being said: the browser frame shows the
 * site's address, the camera eases in on the passage and a highlighter sweeps across it.
 */
export const PageFocus: React.FC<{ scene: RenderScene; durationInFrames: number }> = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const box = vertical ? { left: 50, top: 290, width: 980, height: 940 } : { left: 200, top: 130, width: 1520, height: 740 };
  const bar = 54;
  const viewH = box.height - bar;
  const focus = scene.imageFocus;
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.12], { extrapolateRight: "clamp" });
  const rise = interpolate(frame, [0, 14], [50, 0], { extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
  const sweep = interpolate(frame, [12, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 2) });

  let sheet: React.ReactNode;
  if (focus) {
    // Lay the capture out at frame width x zoom and keep the passage in the middle of the window.
    const w = box.width * zoom;
    const h = w / focus.aspect;
    const cx = (focus.x + focus.w / 2) * w;
    const cy = (focus.y + focus.h / 2) * h;
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    const tx = w > box.width ? clamp(box.width / 2 - cx, box.width - w, 0) : (box.width - w) / 2;
    const ty = h > viewH ? clamp(viewH / 2 - cy, viewH - h, 0) : (viewH - h) / 2;
    sheet = (
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transform: `translate(${tx}px, ${ty}px)` }}>
        <Img src={staticFile(scene.image!)} style={{ width: "100%", height: "100%" }} />
        <div
          style={{
            position: "absolute",
            left: `${(focus.x - 0.006) * 100}%`,
            top: `${(focus.y - 0.01) * 100}%`,
            width: `${(focus.w + 0.012) * sweep * 100}%`,
            height: `${(focus.h + 0.02) * 100}%`,
            background: "#ffe14d",
            mixBlendMode: "multiply",
            opacity: 0.75,
            borderRadius: 6,
          }}
        />
      </div>
    );
  } else {
    sheet = <Img src={staticFile(scene.image!)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 0%", transform: `scale(${zoom})`, transformOrigin: "50% 0%" }} />;
  }

  return (
    <div
      style={{
        position: "absolute",
        ...box,
        borderRadius: 22,
        overflow: "hidden",
        border: `1px solid ${theme.stroke}`,
        boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        background: "#fff",
        transform: `translateY(${rise}px)`,
        fontFamily: theme.font,
      }}
    >
      <div style={{ height: bar, background: "#1c1f2a", display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        {scene.imageHost && (
          <div style={{ marginLeft: 16, flex: 1, height: 34, borderRadius: 17, background: "#2a2e3c", color: "#c9cfdd", fontSize: 21, display: "flex", alignItems: "center", padding: "0 18px" }}>
            🔒 {scene.imageHost}
          </div>
        )}
      </div>
      <div style={{ position: "relative", height: viewH, overflow: "hidden" }}>{sheet}</div>
    </div>
  );
};

/** Product photos cut out of a white studio backdrop are transparent PNGs. */
export const isCutout = (photo: string | null | undefined) => Boolean(photo?.endsWith(".png"));

/** A cut-out product floats with a soft shadow; a normal photo gets rounded corners and a drop shadow. */
export const photoFrame = (cutout: boolean): React.CSSProperties =>
  cutout ? { filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.6))" } : { borderRadius: 24, boxShadow: "0 50px 140px rgba(0,0,0,0.65)" };

/** Real product photo: sharp on a blurred copy of itself, slow push-in, name and credit. */
export const ProductShot: React.FC<{ scene: RenderScene; durationInFrames: number; fullBleed?: boolean }> = ({ scene, durationInFrames, fullBleed: wantFullBleed }) => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const cutout = isCutout(scene.photo);
  const fullBleed = wantFullBleed && !cutout;
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.08]);
  const rise = interpolate(frame, [0, 14], [40, 0], { extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
  const src = staticFile(scene.photo!);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      {cutout ? (
        <>
          <Backdrop seed={3} />
          <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 52%, rgba(255,255,255,0.16), transparent 42%)" }} />
        </>
      ) : (
        <Img src={src} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: fullBleed ? undefined : "blur(40px) brightness(0.45)", transform: `scale(${fullBleed ? zoom : 1.1})` }} />
      )}
      {fullBleed ? (
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(7,8,12,0.35) 0%, rgba(7,8,12,0) 40%, rgba(7,8,12,0.8) 100%)" }} />
      ) : (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: vertical ? "420px 60px 700px" : "250px 160px 190px" }}>
          <Img
            src={src}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              ...photoFrame(cutout),
              transform: `translateY(${rise}px) scale(${zoom})`,
            }}
          />
        </AbsoluteFill>
      )}
      {scene.photoCredit && (
        <div style={{ position: "absolute", right: 40, bottom: 24, fontFamily: theme.font, fontSize: 18, color: "rgba(255,255,255,0.6)" }}>
          📷 {scene.photoCredit}
        </div>
      )}
    </AbsoluteFill>
  );
};
