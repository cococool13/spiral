"use client";

import { m, useReducedMotion } from "framer-motion";
import HeroLogo from "./HeroLogo";
import InteractiveGrid from "./InteractiveGrid";

const pillars = [
  {
    title: "Privacy",
    body: "No accounts. No telemetry. The only network calls are the ones you ask for.",
  },
  {
    title: "Ease of use",
    body: "One window, one job. Click, done. Nothing to configure before it works.",
  },
  {
    title: "Lightweight",
    body: "Native binaries a few megabytes each. Close the window and nothing keeps running.",
  },
];

/**
 * Full-bleed hero over an interactive dot lattice: a concrete grid that warms
 * toward helix red under the cursor. Code-rendered (canvas + gradients) — no
 * image payload.
 */
export default function Hero() {
  const reduced = useReducedMotion();
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6"
    >
      <LatticeScene />

      <div className="relative z-10 flex max-w-4xl flex-col items-center text-center">
        <HeroLogo size={128} />
        <m.h1
          className="type-display mt-8 text-6xl text-paper sm:text-7xl md:text-8xl"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.85 }}
        >
          Spiral
        </m.h1>
        <m.p
          className="mt-6 max-w-xl text-lg text-concrete sm:text-xl"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 16, delay: 1.05 }}
        >
          Small tools. No bloat. Your data stays yours.
        </m.p>

        <m.div
          className="mt-16 grid w-full grid-cols-1 gap-8 text-left sm:grid-cols-3"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 70, damping: 16, delay: 1.3 }}
        >
          {pillars.map((p) => (
            <div key={p.title}>
              <h2 className="type-eyebrow text-paper">{p.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray">{p.body}</p>
            </div>
          ))}
        </m.div>
      </div>
    </section>
  );
}

/**
 * The hero's surface. The interactive lattice does the work; everything else
 * here is atmosphere that keeps the wordmark legible over it — a lifted base,
 * one red practical, film grain, and a vignette.
 *
 * (This replaced the code-rendered concrete-warehouse interior. That version
 * is recoverable from commit 7ccf37a if the room is ever wanted back.)
 */
function LatticeScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* Base: night interior, the floor a touch warmer than the ceiling */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--spiral-black) 0%, #141416 42%, #161311 74%, var(--spiral-black) 100%)",
        }}
      />

      <InteractiveGrid />

      {/* Red practical raking in from the right — the lattice picks it up */}
      <div
        className="absolute -right-[8%] top-[6%] h-[90%] w-[40%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(55% 60% at 70% 40%, rgba(213,46,43,.20), rgba(111,16,17,.08) 55%, transparent 75%)",
          filter: "blur(40px)",
        }}
      />

      {/* Film grain */}
      <svg className="absolute inset-0 h-full w-full opacity-[.07]">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" seed="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* Scrim + vignette for legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(11,11,12,.55) 100%), linear-gradient(180deg, rgba(11,11,12,.34) 0%, rgba(11,11,12,.10) 40%, rgba(11,11,12,.52) 100%)",
        }}
      />
    </div>
  );
}
