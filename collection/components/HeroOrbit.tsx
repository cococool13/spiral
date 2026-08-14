"use client";

import { m, useReducedMotion } from "framer-motion";
import HeroLogo from "./HeroLogo";

/**
 * The hero's figure: the Spiral mark held at the centre of a rosette of
 * orbits.
 *
 * It is one idea drawn twice. The mark assembles from three machined parts,
 * and the rings around it are the same three-fold turn traced out in space —
 * so the thing the apps are named for is what the hero actually shows.
 *
 * Five rings, each a full ellipse expressed as a path (not `<ellipse>`) so
 * `pathLength="1"` is honoured everywhere and the draw-on is a plain 1 → 0
 * offset. The static `rotate()` lives on the path and the animated one on its
 * group: a CSS transform on the group would otherwise override the presentation
 * attribute and stack every ring on the same axis.
 */

const CX = 210;
const CY = 210;
const RX = 182;
const RY = 74;

/** One closed ellipse, drawn as two half arcs from the left extreme. */
const RING = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX + RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX - RX} ${CY}`;

/** Angle around the shared centre, turn rate, and direction, per ring. */
const RINGS = [
  { angle: 0, dur: "68s", reverse: false },
  { angle: 36, dur: "92s", reverse: true },
  { angle: 72, dur: "112s", reverse: false },
  { angle: 108, dur: "84s", reverse: true },
  { angle: 144, dur: "128s", reverse: false },
];

export default function HeroOrbit() {
  const reduced = useReducedMotion();

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[17rem] sm:max-w-[21rem] lg:max-w-[34rem]">
      {/* The mark reads as the light source in the room, so the glow belongs
          to it rather than to the panel behind it. */}
      <div
        aria-hidden="true"
        className="absolute inset-[16%] rounded-full mix-blend-screen"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--spiral-red) 46%, transparent), transparent 74%)",
          filter: "blur(46px)",
        }}
      />

      <div aria-hidden="true" className="orbit-tilt absolute inset-0">
        <svg
          aria-hidden="true"
          viewBox="0 0 420 420"
          className="h-full w-full overflow-visible"
        >
          {RINGS.map(({ angle, dur, reverse }) => (
            <g
              key={angle}
              className={`orbit-ring${reverse ? " orbit-ring--rev" : ""}`}
              style={{ "--orbit-dur": dur } as React.CSSProperties}
            >
              <m.path
                d={RING}
                transform={`rotate(${angle} ${CX} ${CY})`}
                pathLength={1}
                fill="none"
                stroke="var(--spiral-concrete)"
                strokeOpacity={0.5}
                strokeWidth={1.25}
                strokeDasharray="1 1"
                initial={reduced ? false : { strokeDashoffset: 1 }}
                animate={{ strokeDashoffset: 0 }}
                transition={{
                  duration: 1.5,
                  delay: 0.35 + angle / 260,
                  ease: [0.2, 0.7, 0.2, 1],
                }}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* The mark is sized as a share of the rosette, not in pixels: the
          figure shrinks by more than half on a phone, and a fixed 128px mark
          would end up wearing the rings rather than sitting inside them. */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="h-[28%] [&>svg]:h-full [&>svg]:w-auto">
          <HeroLogo size={128} />
        </div>
      </div>
    </div>
  );
}
