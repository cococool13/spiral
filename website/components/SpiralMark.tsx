"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The continuous single-stroke spiral from /branding/spiral-stroke.svg,
 * inlined so the path can draw in on load. Path data mirrors the branding
 * asset (Archimedean spiral, 3.25 turns, 200x200 viewBox).
 */
export function spiralPath(
  cx = 100,
  cy = 100,
  turns = 3.25,
  steps = 260,
  radius = 88,
): string {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * 2 * Math.PI - Math.PI / 2;
    const r = radius * (1 - t * 0.94);
    const x = (cx + r * Math.cos(a)).toFixed(2);
    const y = (cy + r * Math.sin(a)).toFixed(2);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return d;
}

export default function SpiralMark({
  size = 120,
  strokeWidth = 3,
  className = "",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      role="img"
      aria-label="Spiral mark"
    >
      <motion.path
        d={spiralPath()}
        stroke="var(--spiral-red)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2, ease: [0.2, 0.7, 0.2, 1] }}
      />
    </svg>
  );
}
