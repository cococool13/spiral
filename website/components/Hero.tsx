"use client";

import { motion, useReducedMotion } from "framer-motion";
import HeroLogo from "./HeroLogo";

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
          transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.85 }}
        >
          Spiral
        </motion.h1>
        <motion.p
          className="mt-6 max-w-xl text-lg text-concrete sm:text-xl"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 16, delay: 1.05 }}
        >
          Small tools. No bloat. Your data stays yours.
        </motion.p>

        <motion.div
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
        </motion.div>
      </div>
    </section>
  );
}

function WarehouseScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* Base: night interior, faint warm bounce near the floor */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--spiral-black) 0%, #141416 42%, #161311 74%, var(--spiral-black) 100%)",
        }}
      />

      {/* Raw cement surface — coarse mottling + fine tooth */}
      <svg className="absolute inset-0 h-full w-full opacity-[.20] mix-blend-overlay">
        <filter id="cement-coarse">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="5" seed="11" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cement-coarse)" />
      </svg>
      <svg className="absolute inset-0 h-full w-full opacity-[.10] mix-blend-overlay">
        <filter id="cement-fine">
          <feTurbulence type="fractalNoise" baseFrequency="0.09 0.11" numOctaves="3" seed="5" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cement-fine)" />
      </svg>

      {/* Wall detailing fades out where the wall meets the floor */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: "linear-gradient(180deg, black 68%, transparent 94%)",
          WebkitMaskImage: "linear-gradient(180deg, black 68%, transparent 94%)",
        }}
      >
        {/* Board-formed panel seams: vertical joints with a lit top edge */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "repeating-linear-gradient(90deg, transparent 0 calc(16.66% - 2px), rgba(0,0,0,.42) calc(16.66% - 2px) calc(16.66% - 1px), rgba(216,214,209,.05) calc(16.66% - 1px) 16.66%)",
          }}
        />
        {/* Horizontal pour joints */}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "linear-gradient(180deg, transparent calc(30% - 1px), rgba(0,0,0,.38) calc(30% - 1px) 30%, rgba(216,214,209,.04) 30% calc(30% + 1px), transparent calc(30% + 1px)), linear-gradient(180deg, transparent calc(62% - 1px), rgba(0,0,0,.38) calc(62% - 1px) 62%, rgba(216,214,209,.04) 62% calc(62% + 1px), transparent calc(62% + 1px))",
          }}
        />
        {/* Form-tie holes, the giveaway detail of cast concrete */}
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(circle 4px at 8.33% 26%, rgba(0,0,0,.55) 0 3px, rgba(216,214,209,.06) 3px 4px, transparent 4px), radial-gradient(circle 4px at 41.6% 26%, rgba(0,0,0,.55) 0 3px, rgba(216,214,209,.06) 3px 4px, transparent 4px), radial-gradient(circle 4px at 75% 26%, rgba(0,0,0,.55) 0 3px, rgba(216,214,209,.06) 3px 4px, transparent 4px), radial-gradient(circle 4px at 24.9% 58%, rgba(0,0,0,.5) 0 3px, rgba(216,214,209,.05) 3px 4px, transparent 4px), radial-gradient(circle 4px at 58.3% 58%, rgba(0,0,0,.5) 0 3px, rgba(216,214,209,.05) 3px 4px, transparent 4px), radial-gradient(circle 4px at 91.6% 58%, rgba(0,0,0,.5) 0 3px, rgba(216,214,209,.05) 3px 4px, transparent 4px)",
          }}
        />
      </div>

      {/* Structural columns, one lit edge each */}
      <div
        className="absolute bottom-0 left-[13%] top-0 w-[6.5%]"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.35) 30%, rgba(216,214,209,.10) 88%, rgba(244,243,240,.16) 94%, rgba(0,0,0,.8))",
        }}
      />
      <div
        className="absolute bottom-0 right-[16%] top-0 w-[7%]"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,.8), rgba(213,46,43,.10) 8%, rgba(0,0,0,.4) 35%, rgba(0,0,0,.72))",
        }}
      />

      {/* Cool moonlight through a mullioned window, projected across the left wall */}
      <div
        className="absolute left-[2%] top-[16%] h-[62%] w-[30%] -skew-x-12 rotate-2 mix-blend-screen"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(226,232,240,.09) 0 22%, rgba(0,0,0,0) 22% 27%), repeating-linear-gradient(0deg, rgba(226,232,240,.07) 0 30%, rgba(0,0,0,0) 30% 34%)",
          maskImage:
            "radial-gradient(80% 90% at 50% 40%, black 30%, transparent 85%)",
          WebkitMaskImage:
            "radial-gradient(80% 90% at 50% 40%, black 30%, transparent 85%)",
          filter: "blur(6px)",
        }}
      />
      {/* Volumetric shaft feeding that window light */}
      <div
        className="absolute -top-[25%] left-[6%] h-[130%] w-[24%] rotate-[14deg] mix-blend-screen"
        style={{
          background:
            "linear-gradient(180deg, rgba(226,232,240,.13), rgba(226,232,240,.03) 55%, transparent 80%)",
          filter: "blur(30px)",
        }}
      />

      {/* Red practical light raking the right wall */}
      <div
        className="absolute -right-[8%] top-[6%] h-[90%] w-[40%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(55% 60% at 70% 40%, rgba(213,46,43,.26), rgba(111,16,17,.10) 55%, transparent 75%)",
          filter: "blur(40px)",
        }}
      />
      {/* ...and its source: an LED strip mounted on the right column's edge */}
      <div
        className="absolute right-[23%] top-[10%] h-[64%] w-[2px]"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(213,46,43,.9) 8%, rgba(213,46,43,.75) 85%, transparent)",
        }}
      />
      <div
        className="absolute right-[22.4%] top-[10%] h-[64%] w-[14px] mix-blend-screen"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(213,46,43,.5) 10%, rgba(213,46,43,.35) 85%, transparent)",
          filter: "blur(8px)",
        }}
      />

      {/* Ambient occlusion where the wall meets the floor */}
      <div
        className="absolute inset-x-0 bottom-[22%] h-[8%]"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(0,0,0,.45) 70%, rgba(0,0,0,.55))",
          filter: "blur(10px)",
        }}
      />
      {/* Floor: darkness, a faint sheen line, red pooling in reflection */}
      <div
        className="absolute inset-x-0 bottom-0 h-[28%]"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(0,0,0,.5) 35%, rgba(0,0,0,.78))",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-[24%] h-px opacity-40"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(216,214,209,.35) 30%, rgba(216,214,209,.1) 60%, transparent)",
        }}
      />
      <div
        className="absolute bottom-0 right-[8%] h-[16%] w-[34%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(70% 100% at 50% 100%, rgba(213,46,43,.13), transparent 70%)",
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
            "radial-gradient(120% 90% at 50% 45%, transparent 40%, rgba(11,11,12,.72) 100%), linear-gradient(180deg, rgba(11,11,12,.5) 0%, rgba(11,11,12,.18) 40%, rgba(11,11,12,.7) 100%)",
        }}
      />
    </div>
  );
}
