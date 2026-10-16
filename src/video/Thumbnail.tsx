import { AbsoluteFill, Img, OffthreadVideo, staticFile } from "remotion";
import type { RenderProps } from "../types";
import { Backdrop } from "./Background";
import { theme } from "./theme";

/** Bold, high-contrast thumbnail: footage on the right, big words on the left. */
export const Thumbnail: React.FC<RenderProps> = ({ scenes, thumbnailText, channelName }) => {
  const photo = scenes.find((s) => s.photo) ?? null;
  const visual = photo ? null : (scenes.find((s) => s.broll) ?? null);
  const shot = scenes.find((s) => s.image) ?? null;
  const words = thumbnailText.toUpperCase().split(" ");
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.font }}>
      {photo ? (
        <Img src={staticFile(photo.photo!)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : visual ? (
        <OffthreadVideo src={staticFile(visual.broll!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : shot ? (
        <Img src={staticFile(shot.image!)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      ) : (
        <Backdrop seed={3} />
      )}
      {(photo || visual || shot) && (
        <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(7,8,12,0.94) 0%, rgba(7,8,12,0.78) 38%, rgba(7,8,12,0.1) 78%)" }} />
      )}
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 64, width: "64%" }}>
        {words.map((w, i) => (
          <div
            key={i}
            style={{
              fontSize: words.length > 3 ? 104 : 132,
              fontWeight: 900,
              lineHeight: 0.98,
              letterSpacing: -4,
              color: i === words.length - 1 ? theme.accent : theme.text,
              textShadow: "0 8px 0 rgba(0,0,0,0.5), 0 0 60px rgba(0,0,0,0.6)",
            }}
          >
            {w}
          </div>
        ))}
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 64, bottom: 40, fontSize: 26, fontWeight: 800, letterSpacing: 4, color: "rgba(255,255,255,0.75)" }}>
        <span style={{ color: theme.accent }}>●</span> {channelName.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
};
