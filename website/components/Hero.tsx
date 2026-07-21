"use client";

import { motion, useReducedMotion } from "framer-motion";
import SpiralMark, { spiralPath } from "./SpiralMark";

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
 * Full-bleed cinematic hero: a code-rendered metallic spiral catching red
 * light on dark concrete — depth from lighting, not flat UI color — with a
 * scrim for legibility.
 */
export default function Hero() {
  const reduced = useReducedMotion();
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6"
    >
      {/* Cinematic background: concrete gradients + giant spiral catching red light */}
      <div aria-hidden="true" className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 70% 15%, rgba(213,46,43,.16), transparent 55%), radial-gradient(90% 70% at 20% 85%, rgba(216,214,209,.07), transparent 60%), linear-gradient(180deg, var(--spiral-black) 0%, #101012 55%, var(--spiral-black) 100%)",
          }}
        />
        <svg
          viewBox="0 0 200 200"
          fill="none"
          className="absolute -right-[15%] top-1/2 h-[140vmin] w-[140vmin] -translate-y-1/2 opacity-40"
        >
          <defs>
            <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--spiral-concrete)" stopOpacity=".9" />
              <stop offset=".45" stopColor="var(--spiral-gray)" stopOpacity=".25" />
              <stop offset=".7" stopColor="var(--spiral-red)" stopOpacity=".55" />
              <stop offset="1" stopColor="var(--spiral-oxblood)" stopOpacity=".2" />
            </linearGradient>
          </defs>
          <path
            d={spiralPath(100, 100, 3.25, 260, 96)}
            stroke="url(#metal)"
            strokeWidth={7}
            strokeLinecap="round"
          />
        </svg>
        {/* Scrim for legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,11,12,.55) 0%, rgba(11,11,12,.25) 40%, rgba(11,11,12,.8) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 flex max-w-4xl flex-col items-center text-center">
        <SpiralMark size={112} />
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
