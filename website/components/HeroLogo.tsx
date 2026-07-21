"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion } from "framer-motion";

/**
 * The actual Spiral helix mark (path data mirrors /branding/spiral-mark.svg),
 * inlined for the signature entrance: mechanical assembly. The three
 * segments arrive as separate machined parts — the core first, then the
 * upper and lower bands sliding in to lock against it with a spring
 * settle — followed by one specular sweep across the assembled mark.
 */
export const MARK_VIEWBOX = "337 154 352 566";

export const MARK_PATHS = [
  // Core band (center)
  "M529.259 337.978C531.149 337.917 539.823 342.101 542.227 343.176L565.834 353.636C575.81 358.069 585.831 362.398 595.896 366.624C607.103 371.227 616.429 374.136 626.727 380.807C643.878 391.918 657.468 408.737 650.84 430.226C642.57 457.039 615.21 472.463 591.975 484.903C572.681 458.156 538.448 450.902 510.297 435.992C510.673 449.177 510.44 463.253 510.554 476.526C510.864 498.047 510.993 519.571 510.939 541.095C508.763 540.243 506.305 539.118 504.125 538.182C474.206 525.739 444.975 511.316 414.678 499.592C399.233 493.615 383.552 484.757 376.377 469.154C371.522 458.458 371.139 446.265 375.312 435.285C381.114 419.787 393.357 413.164 407.017 405.462C415.476 400.692 422.463 397.173 431.284 393.232C448.417 407.993 458.979 412.347 479.189 421.484L509.836 435.63C509.045 426.941 509.377 413.395 509.328 404.435L509.065 348.632C515.793 345.335 522.634 341.539 529.259 337.978Z",
  // Upper band
  "M556.692 174.487L557.044 174.592C557.51 175.745 557.932 298.469 557.739 306.768C518.556 328.362 479.207 349.653 439.694 370.638C420.47 380.993 399.084 391.105 381.252 403.764C371.714 410.534 363.903 420.45 359.371 431.308L359.257 431.547L358.909 431.314C358.121 417.082 358.542 398.38 358.472 383.805L358.33 350.887C358.28 337.345 357.475 325.345 361.09 312.138C364.9 297.735 372.717 284.708 383.633 274.569C393.724 265.211 407.036 258.21 419.074 251.452L449.278 234.549L556.692 174.487Z",
  // Lower band
  "M663.932 440.8L665.658 441.395C665.388 463.86 665.553 486.811 665.581 509.123C665.626 545.117 668.613 578.143 637.226 603.154C618.862 617.788 597.54 627.201 576.807 638.402C554.404 650.358 532.131 662.556 509.991 674.992C495.152 683.2 481.231 690.608 466.512 699.311L466.382 570.818C491.036 557.713 515.265 543.791 539.805 530.554C558.871 520.474 578.016 510.469 596.685 499.664C621.384 485.369 652.41 468.546 663.932 440.8Z",
];

// Where each part travels FROM, and when it departs. The core drops in
// first; the bands slide in from the directions they visually "grow" from.
const PIECES = [
  { d: MARK_PATHS[0], from: { x: 0, y: 0, rotate: 16, scale: 0.55 }, delay: 0.05 },
  { d: MARK_PATHS[1], from: { x: -120, y: -140, rotate: -9, scale: 1 }, delay: 0.42 },
  { d: MARK_PATHS[2], from: { x: 110, y: 150, rotate: 9, scale: 1 }, delay: 0.74 },
];

const LOCK_SPRING = { type: "spring", stiffness: 250, damping: 19, mass: 0.9 } as const;

export default function HeroLogo({ size = 128 }: { size?: number }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const height = size;
  const width = Math.round((size * 352) / 566);

  return (
    <svg
      width={width}
      height={height}
      viewBox={MARK_VIEWBOX}
      fill="none"
      role="img"
      aria-label="Spiral mark"
      className={mounted ? undefined : "pre-hydration-hidden"}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="mark-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="mark-mask" maskUnits="userSpaceOnUse">
          {MARK_PATHS.map((d) => (
            <path key={d.slice(0, 24)} d={d} fill="#fff" />
          ))}
        </mask>
      </defs>

      {PIECES.map(({ d, from, delay }) =>
        reduced ? (
          <path key={d.slice(0, 24)} d={d} fill="var(--spiral-red)" />
        ) : (
          <m.path
            key={d.slice(0, 24)}
            d={d}
            fill="var(--spiral-red)"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ ...from, opacity: 0 }}
            animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
            transition={{
              ...LOCK_SPRING,
              delay,
              opacity: { duration: 0.22, delay, ease: "easeOut" },
            }}
          />
        ),
      )}

      {/* One specular sweep across the assembled mark */}
      {!reduced && (
        <g mask="url(#mark-mask)">
          <m.rect
            x={197}
            y={124}
            width={150}
            height={640}
            fill="url(#mark-sheen)"
            style={{ skewX: -16 }}
            initial={{ x: 0, opacity: 0 }}
            animate={{ x: 520, opacity: [0, 1, 1, 0] }}
            transition={{
              delay: 1.45,
              duration: 0.65,
              ease: [0.2, 0.7, 0.2, 1],
              opacity: { delay: 1.45, duration: 0.65, times: [0, 0.15, 0.7, 1] },
            }}
          />
        </g>
      )}
    </svg>
  );
}
