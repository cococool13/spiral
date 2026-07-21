"use client";

import { motion, useReducedMotion } from "framer-motion";
import HeroLogo, { MARK_PATHS, MARK_VIEWBOX } from "./HeroLogo";

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
 * Full-bleed cinematic hero staged like a photograph of a concrete
 * warehouse at night: textured walls, volumetric light shafts, a giant
 * steel helix catching red light, film grain and a vignette. All of it is
 * code-rendered (SVG noise + gradients) — no image payload.
 */
export default function Hero() {
  const reduced = useReducedMotion();
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6"
    >
      <WarehouseScene />

      <div className="relative z-10 flex max-w-4xl flex-col items-center text-center">
        <HeroLogo size={128} />
        <motion.h1
          className="type-display mt-8 text-6xl text-paper sm:text-7xl md:text-8xl"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.5 }}
        >
          Spiral
        </motion.h1>
        <motion.p
          className="mt-6 max-w-xl text-lg text-concrete sm:text-xl"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.75 }}
        >
          Small tools. No bloat. Your data stays yours.
        </motion.p>

        <motion.div
          className="mt-16 grid w-full grid-cols-1 gap-8 text-left sm:grid-cols-3"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 70, damping: 16, delay: 1 }}
        >
          {pillars.map((p) => (
            <div key={p.title}>
              <h2 className="type-eyebrow text-paper">{p.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray">{p.body}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function WarehouseScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* Base: night interior, faint warm bounce off the floor */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--spiral-black) 0%, #131315 46%, #17120f 72%, var(--spiral-black) 100%)",
        }}
      />

      {/* Concrete wall texture — SVG fractal noise, blended like raw cement */}
      <svg className="absolute inset-0 h-full w-full opacity-[.22] mix-blend-overlay">
        <filter id="concrete">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="5" seed="7" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.9" intercept="0" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#concrete)" />
      </svg>

      {/* Giant steel helix — the actual mark — leaning out of the dark, catching the red light */}
      <svg
        viewBox={MARK_VIEWBOX}
        className="absolute -right-[8%] top-1/2 h-[130vmin] -translate-y-[46%] opacity-[.32]"
        style={{ filter: "blur(1.5px)" }}
      >
        <defs>
          <linearGradient id="steel-helix" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--spiral-concrete)" stopOpacity=".55" />
            <stop offset=".4" stopColor="var(--spiral-gray)" stopOpacity=".12" />
            <stop offset=".62" stopColor="var(--spiral-red)" stopOpacity=".7" />
            <stop offset=".85" stopColor="var(--spiral-oxblood)" stopOpacity=".35" />
            <stop offset="1" stopColor="var(--spiral-black)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {MARK_PATHS.map((d) => (
          <path key={d.slice(0, 24)} d={d} fill="url(#steel-helix)" />
        ))}
      </svg>

      {/* Volumetric light shafts through high windows */}
      <div
        className="absolute -top-[20%] left-[8%] h-[120%] w-[22%] rotate-[16deg] mix-blend-screen"
        style={{
          background:
            "linear-gradient(180deg, rgba(244,243,240,.14), rgba(244,243,240,.03) 55%, transparent 80%)",
          filter: "blur(28px)",
        }}
      />
      <div
        className="absolute -top-[20%] left-[30%] h-[120%] w-[10%] rotate-[16deg] mix-blend-screen"
        style={{
          background:
            "linear-gradient(180deg, rgba(244,243,240,.09), transparent 70%)",
          filter: "blur(22px)",
        }}
      />
      {/* Red practical light spilling from the right, where the helix stands */}
      <div
        className="absolute -right-[10%] top-[10%] h-[85%] w-[45%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(60% 55% at 65% 45%, rgba(213,46,43,.30), rgba(111,16,17,.12) 55%, transparent 75%)",
          filter: "blur(36px)",
        }}
      />

      {/* Polished floor: horizon line + soft red reflection pooling on it */}
      <div
        className="absolute inset-x-0 bottom-0 h-[26%]"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(0,0,0,.55) 40%, rgba(0,0,0,.75))",
        }}
      />
      <div
        className="absolute bottom-0 right-[6%] h-[18%] w-[38%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(70% 100% at 50% 100%, rgba(213,46,43,.14), transparent 70%)",
          filter: "blur(24px)",
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
            "radial-gradient(120% 90% at 50% 45%, transparent 40%, rgba(11,11,12,.72) 100%), linear-gradient(180deg, rgba(11,11,12,.5) 0%, rgba(11,11,12,.15) 40%, rgba(11,11,12,.7) 100%)",
        }}
      />
    </div>
  );
}
