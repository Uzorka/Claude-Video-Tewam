import { Composition, Still } from "remotion";
import type { RenderProps } from "../types";
import { demoPlan } from "../demo";
import { FPS, HEIGHT, WIDTH } from "./theme";
import { Thumbnail } from "./Thumbnail";
import { Video } from "./Video";

const sample: RenderProps = {
  channelName: "Uzorka Tech",
  title: demoPlan.title,
  thumbnailText: demoPlan.thumbnail_text,
  music: null,
  scenes: demoPlan.scenes.map((s) => ({
    ...s,
    audio: null,
    duration: 5,
    broll: null,
    brollDuration: null,
    image: null,
    words: s.narration.split(" ").map((word, i) => ({ word, start: i * 0.35, end: i * 0.35 + 0.3 })),
  })),
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="Video"
      component={Video}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={FPS * 30}
      defaultProps={sample}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.scenes.reduce((n, s) => n + Math.round(s.duration * FPS), 0),
      })}
    />
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} defaultProps={sample} />
  </>
);
