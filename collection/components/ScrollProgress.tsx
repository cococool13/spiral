"use client";

import { m, useScroll, useSpring, useReducedMotion } from "framer-motion";

/** Archimedean spiral path (matches /brand/logo/stroke.svg). */
function spiralPath(cx = 100, cy = 100, turns = 3.25, steps = 260, radius = 88): string {
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

const SPIRAL_D = spiralPath();

/**
 * Scroll-progress indicator echoing the logo's spiral stroke: the spiral
 * draws itself as you move down the page. Fixed bottom-right, hidden for
 * reduced motion.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.4,
  });
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed bottom-6 right-6 z-40 hidden md:block opacity-70"
    >
      <svg width={40} height={40} viewBox="0 0 200 200" fill="none">
        <path
          d={SPIRAL_D}
          stroke="rgba(244,243,240,.15)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <m.path
          d={SPIRAL_D}
          stroke="var(--spiral-red)"
          strokeWidth={8}
          strokeLinecap="round"
          style={{ pathLength: progress }}
        />
      </svg>
    </div>
  );
}
