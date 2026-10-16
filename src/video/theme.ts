import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Bundled with the project (SIL Open Font License) so rendering never depends on a font CDN.
const fontFamily = "Inter";
loadFont({ family: fontFamily, url: staticFile("fonts/inter-variable.woff2"), weight: "100 900" });

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const theme = {
  bg: "#07080c",
  panel: "rgba(12, 14, 22, 0.78)",
  stroke: "rgba(255,255,255,0.10)",
  text: "#f5f7fb",
  muted: "#a3acc2",
  accent: "#ff3b5c", // signature red, used sparingly
  accent2: "#4cc9f0",
  font: `${fontFamily}, 'Helvetica Neue', Arial, sans-serif`,
};
