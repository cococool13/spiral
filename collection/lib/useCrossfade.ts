import { type MotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { useState } from "react";

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
  // 0.06, not 0.25. At a quarter of a span the ramps at each boundary were
  // 0.125 of total progress wide — 878px of a 2,340px scroll range, 37.5%, in
  // which two panels were both legible and printed on top of each other.
  // Because the panels are `absolute inset-0` with different content heights
  // they did not stack, they smeared, and anyone stopping mid-scroll landed in
  // it. At 0.06 the boundary reads as a cut with just enough overlap to avoid
  // the empty stage this constant exists to prevent.
  const fade = span * 0.06;
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
  // `off` comes off the same value as the fade, so a panel leaves the tab
  // order and the accessibility tree exactly when it stops being visible.
  // Without it every off-panel sat at `opacity: 0` while still focusable:
  // three focus stops on nothing, and four links all named "What it does".
  // It is React state rather than a motion value because `inert` is an
  // attribute, not a style — and it only changes at boundary crossings, so
  // this re-renders a handful of times across the whole sequence, not once
  // per frame.
  const faded = useTransform(opacity, (o) => o < 0.02);
  const [off, setOff] = useState(() => faded.get());
  useMotionValueEvent(faded, "change", setOff);

  return { opacity, y, scale, off };
}
