"use client";

import { motion, useScroll, useSpring, useReducedMotion } from "framer-motion";
import { spiralPath } from "./SpiralMark";

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
          d={spiralPath()}
          stroke="rgba(244,243,240,.15)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <motion.path
          d={spiralPath()}
          stroke="var(--spiral-red)"
          strokeWidth={8}
          strokeLinecap="round"
          style={{ pathLength: progress }}
        />
      </svg>
    </div>
  );
}
