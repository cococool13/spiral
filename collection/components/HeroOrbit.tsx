import type { CSSProperties } from "react";
import HeroLogo from "./HeroLogo";

/**
 * The hero's figure: the Spiral mark held at the centre of a rosette of
 * orbits. Rings turn in CSS — transform-only, so they composite.
 */

const CX = 210;
const CY = 210;
const RX = 182;
const RY = 74;

/** One closed ellipse, drawn as two half arcs from the left extreme. */
const RING = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX + RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX - RX} ${CY}`;

const RINGS = [
  { angle: 0, dur: "68s", reverse: false },
  { angle: 36, dur: "92s", reverse: true },
  { angle: 72, dur: "112s", reverse: false },
  { angle: 108, dur: "84s", reverse: true },
  { angle: 144, dur: "128s", reverse: false },
];

export default function HeroOrbit() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[17rem] sm:max-w-[21rem] lg:max-w-[34rem]">
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
              style={{ "--orbit-dur": dur } as CSSProperties}
            >
              <path
                d={RING}
                transform={`rotate(${angle} ${CX} ${CY})`}
                fill="none"
                stroke="var(--spiral-concrete)"
                strokeOpacity={0.5}
                strokeWidth={1.25}
              />
            </g>
          ))}
        </svg>
      </div>

      <div className="absolute inset-0 grid place-items-center">
        <div className="h-[28%] [&>svg]:h-full [&>svg]:w-auto">
          <HeroLogo size={128} />
        </div>
      </div>
    </div>
  );
}
