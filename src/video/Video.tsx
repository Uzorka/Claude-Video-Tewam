import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderProps, RenderScene } from "../types";
import { fadeIn } from "./anim";
import { Backdrop, Footage, PageFocus, ProductShot } from "./Background";
import { Captions } from "./Captions";
import { CompareCard, ListCard, LowerThird, ProcessCard, ProductReveal, ProductSpotlight, QuoteCard, SpecsCard, StatCard, TimelineCard, TitleCard } from "./scenes/Cards";
import { VerticalContext } from "./layout";
import { FPS, theme } from "./theme";

const Scene: React.FC<{ scene: RenderScene; index: number; durationInFrames: number }> = ({ scene, index, durationInFrames }) => {
  const frame = useCurrentFrame();
  const isBroll = scene.kind === "broll" && scene.broll;
  // Entrance: a quick zoom-settle so every cut has energy.
  const enter = interpolate(frame, [0, 9], [1.06, 1], { extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });

  let foreground: React.ReactNode = null;
  switch (scene.kind) {
    case "title":
      foreground = <TitleCard scene={scene} />;
      break;
    case "stat":
      foreground = <StatCard scene={scene} />;
      break;
    case "list":
      foreground = <ListCard scene={scene} durationInFrames={durationInFrames} />;
      break;
    case "compare":
      foreground = <CompareCard scene={scene} />;
      break;
    case "quote":
      foreground = <QuoteCard scene={scene} />;
      break;
    case "screenshot":
      foreground = scene.image ? <PageFocus scene={scene} durationInFrames={durationInFrames} /> : <TitleCard scene={scene} />;
      break;
    case "broll":
      foreground = isBroll || scene.photo ? <LowerThird scene={scene} /> : <TitleCard scene={scene} />;
      break;
    case "product":
      foreground = scene.photo || scene.broll ? <LowerThird scene={{ ...scene, heading: scene.heading ?? scene.product }} /> : <ProductSpotlight scene={scene} />;
      break;
    case "process":
      foreground = <ProcessCard scene={scene} durationInFrames={durationInFrames} />;
      break;
    case "specs":
      foreground = <SpecsCard scene={scene} durationInFrames={durationInFrames} />;
      break;
    case "timeline":
      foreground = <TimelineCard scene={scene} durationInFrames={durationInFrames} />;
      break;
  }

  // Product scenes: the maker's own video clip if there is one, else the official photo as a hero shot.
  const background =
    scene.photo && !scene.broll && (scene.kind === "product" || scene.kind === "broll") ? (
      <ProductShot scene={scene} durationInFrames={durationInFrames} fullBleed={scene.kind === "broll"} />
    ) : scene.broll ? (
      <Footage scene={scene} durationInFrames={durationInFrames} dim={isBroll || scene.kind === "product" ? 0.25 : 0.88} blur={isBroll || scene.kind === "product" ? 0 : 8} />
    ) : (
      <Backdrop seed={index} />
    );

  return (
    <AbsoluteFill style={{ transform: `scale(${enter})`, opacity: fadeIn(frame, 0, 4) }}>
      {background}
      {foreground}
      {/* Any other scene that names a product: its photo pops up when the name is said. */}
      {scene.photo && scene.product && !["product", "broll", "screenshot"].includes(scene.kind) && !scene.sidePhotos && (
        <ProductReveal scene={scene} durationInFrames={durationInFrames} />
      )}
      {scene.audio && <Audio src={staticFile(scene.audio)} />}
    </AbsoluteFill>
  );
};

/** Accent-colored slash that wipes across at each cut. */
const CutFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 8], [-40, 140], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: -200, bottom: -200, left: `${x}%`, width: 60, background: theme.accent, transform: "skewX(-18deg)", opacity: 0.85 }} />
    </AbsoluteFill>
  );
};

const Chrome: React.FC<{ channelName: string; vertical: boolean }> = ({ channelName, vertical }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", fontFamily: theme.font }}>
      <div style={{ position: "absolute", top: 0, left: 0, height: 6, width: `${(frame / durationInFrames) * 100}%`, background: theme.accent }} />
      <div style={{ position: "absolute", top: vertical ? 190 : 40, left: vertical ? 70 : undefined, right: vertical ? undefined : 54, fontSize: vertical ? 28 : 24, fontWeight: 800, letterSpacing: 4, color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
        <span style={{ color: theme.accent }}>●</span> {channelName}
      </div>
    </AbsoluteFill>
  );
};

export const Video: React.FC<RenderProps> = ({ scenes, music, channelName, vertical = false }) => {
  let from = 0;
  return (
    <VerticalContext.Provider value={vertical}>
      <AbsoluteFill style={{ backgroundColor: theme.bg }}>
        {scenes.map((scene, i) => {
          const durationInFrames = Math.round(scene.duration * FPS);
          const start = from;
          from += durationInFrames;
          return (
            <Sequence key={scene.id + i} from={start} durationInFrames={durationInFrames} name={`${i + 1}. ${scene.kind}: ${scene.id}`}>
              <Scene scene={scene} index={i} durationInFrames={durationInFrames} />
              <Captions words={scene.words} />
              {i > 0 && (
                <Sequence durationInFrames={9}>
                  <CutFlash />
                </Sequence>
              )}
            </Sequence>
          );
        })}
        <Chrome channelName={channelName} vertical={vertical} />
        {music && <Audio src={staticFile(music)} volume={0.1} loop />}
      </AbsoluteFill>
    </VerticalContext.Provider>
  );
};
