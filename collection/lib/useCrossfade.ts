import { type MotionValue, useTransform } from "framer-motion";

/**
 * One panel's slice of a sticky scroll sequence.
 *
 * The transitions straddle the boundary between panels rather than meeting at
 * it. Without the overlap there is a stretch of scroll where one panel has
 * finished leaving and the next has not started, and the stage is simply empty
 * — which is exactly what the resume sequence did before this was fixed.
 *
 * The first panel is already present when the section arrives and the last one
 * stays, so a sequence never opens or closes on nothing.
 */
export function useCrossfade(
  progress: MotionValue<number>,
  index: number,
  count: number,
) {
  const span = 1 / count;
  const fade = span * 0.25;
  const from = index * span;
  const to = (index + 1) * span;
  const first = index === 0;
  const last = index === count - 1;

  const stops = [from - fade, from + fade, to - fade, to + fade];
  const opacity = useTransform(progress, stops, [first ? 1 : 0, 1, 1, last ? 1 : 0]);
  const y = useTransform(progress, stops, [
    first ? "0%" : "7%",
    "0%",
    "0%",
    last ? "0%" : "-5%",
  ]);
  const scale = useTransform(progress, stops, [first ? 1 : 0.95, 1, 1, last ? 1 : 0.97]);

  return { opacity, y, scale };
}
