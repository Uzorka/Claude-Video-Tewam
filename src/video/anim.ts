import { interpolate, spring } from "remotion";
import { FPS } from "./theme";

/** 0→1 spring that starts `delay` frames in. */
export const pop = (frame: number, delay = 0, damping = 14) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, mass: 0.6, stiffness: 140 } });

export const fadeIn = (frame: number, start = 0, length = 10) =>
  interpolate(frame, [start, start + length], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const fadeOut = (frame: number, total: number, length = 8) =>
  interpolate(frame, [total - length, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
