import type { CSSProperties } from "react";
import { apps } from "@/lib/apps";
import DownloadMenu from "./DownloadMenu";
import GlassPillCTA from "./GlassPillCTA";
import HeroPin from "./HeroPin";

const wallpaper = apps.find((app) => app.slug === "wallpaper");

/** Entrance: one curve, staggered by a rung. `.rise` lives in globals.css. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * Full-viewport still, type in the middle, no mark on this screen.
 * The plate zooms out on scroll — Superwhisper's move.
 *
 * Photograph: Unsplash, red spiral staircase
 * https://unsplash.com/photos/7s0-Sjs97sk
 */
export default function Hero() {
  return (
    <HeroPin>
      <div className="hero-sticky">
        <div className="hero-frame">
          {/* biome-ignore lint/performance/noImgElement: still is the LCP image */}
          <img
            src="/images/hero-red.webp"
            alt="Looking down a red spiral staircase in a dark interior."
            width={2400}
            height={1601}
            fetchPriority="high"
            className="hero-photo"
          />
          <div
            aria-hidden="true"
            className="hero-wash"
            style={{
              background: "color-mix(in oklab, var(--spiral-void) 18%, transparent)",
            }}
          />
        </div>

        <div className="hero-copy">
          <h1
            className="rise type-display text-paper"
            style={{
              ...rise(0),
              fontSize: "clamp(2.6rem, 7vw, 5.5rem)",
              lineHeight: 0.92,
            }}
          >
            Software that
            <br />
            <em className="font-normal italic">knows when to leave.</em>
          </h1>

          <p
            className="rise mt-6 max-w-xl text-base leading-relaxed text-gray sm:text-lg"
            style={rise(1)}
          >
            No account. No bloat. No tracking.
          </p>

          <div
            className="rise mt-10 flex flex-wrap items-center justify-center gap-3"
            style={rise(2)}
          >
            {wallpaper ? <GlassPillCTA app={wallpaper} /> : null}
            <DownloadMenu />
          </div>
        </div>
      </div>
    </HeroPin>
  );
}
