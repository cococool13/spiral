import Image from "next/image";
import type { CSSProperties } from "react";
import { apps } from "@/lib/apps";
import DownloadMenu from "./DownloadMenu";

const shipped = apps.filter((a) => a.status === "live").length;
const inProgress = apps.length - shipped;

/** Entrance: one curve, staggered by a rung. `.rise` lives in globals.css. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * One screen: the stair photograph, the claim, the download. The page then
 * scrolls like a document — no extra height, no sticky pin, no zoom.
 */
export default function Hero() {
  return (
    <section id="top" className="relative isolate min-h-svh overflow-hidden bg-black">
      <HeroAtmosphere />

      <div className="relative z-20 flex min-h-svh flex-col items-center justify-center px-6 pb-16 pt-32 text-center">
        <div
          className="rise inline-flex items-center border border-white/15 bg-black/40 px-4 py-2 backdrop-blur-sm"
          style={rise(0)}
        >
          <span className="type-eyebrow text-paper">
            {shipped} shipped · {inProgress} in progress
          </span>
        </div>

        <h1
          className="rise type-display mt-8 max-w-4xl text-[2.25rem] text-paper sm:text-5xl md:text-6xl lg:text-7xl"
          style={rise(1)}
        >
          Spiral.
          <br />
          Small software.
        </h1>

        <p
          className="rise mt-6 max-w-lg text-base leading-relaxed text-paper sm:text-lg"
          style={rise(2)}
        >
          Desktop tools that do one job each. No accounts, no telemetry, no background
          process.
        </p>

        <div className="rise mt-10 flex flex-col items-center gap-5" style={rise(3)}>
          <DownloadMenu />
          <a
            href="/#apps"
            className="group inline-flex min-h-11 items-center gap-2 font-mono text-sm text-paper transition-colors hover:text-concrete"
          >
            Browse the apps
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-0.5"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

function HeroAtmosphere() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <Image
        src="/hero/spiral-stair.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[50%_42%]"
      />

      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(180deg,",
            "color-mix(in oklab, var(--spiral-black) 55%, transparent) 0%,",
            "color-mix(in oklab, var(--spiral-black) 52%, transparent) 38%,",
            "color-mix(in oklab, var(--spiral-black) 72%, transparent) 100%)",
          ].join(" "),
        }}
      />

      <div className="absolute inset-0 bg-black/35" />

      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(70% 55% at 50% 38%, transparent 30%,",
            "color-mix(in oklab, var(--spiral-black) 62%, transparent) 100%)",
          ].join(" "),
        }}
      />
    </div>
  );
}
