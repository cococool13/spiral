import type { CSSProperties } from "react";
import DownloadMenu from "./DownloadMenu";
import HeroPin from "./HeroPin";

/** Entrance: one curve, staggered by a rung. `.rise` lives in globals.css. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * Full-viewport still, type in the middle, no mark on this screen.
 * The plate zooms out on scroll — Superwhisper's move.
 *
 * Photograph: Unsplash, dark corridor with the exit lit at the far end
 * https://unsplash.com/photos/E_kMaBHrw0k
 */
export default function Hero() {
  return (
    <HeroPin>
      <div className="hero-sticky">
        <div className="hero-frame">
          {/* biome-ignore lint/performance/noImgElement: still is the LCP image */}
          <img
            src="/images/hero-exit.webp"
            alt="A dark corridor with daylight at the far door."
            width={2400}
            height={1350}
            fetchPriority="high"
            className="hero-photo"
          />
          <div
            aria-hidden="true"
            className="hero-wash"
            style={{
              background: "color-mix(in oklab, var(--spiral-void) 8%, transparent)",
            }}
          />
        </div>

        <div className="hero-copy">
          <h1
            className="rise type-display text-[2.75rem] text-paper sm:text-6xl lg:text-7xl"
            style={rise(0)}
          >
            Software that
            <br />
            <em className="font-normal italic">knows when to leave.</em>
          </h1>

          <p
            className="rise mt-6 max-w-xl text-base leading-relaxed text-paper sm:text-lg"
            style={rise(1)}
          >
            No account. No bloat. No tracking.
          </p>

          <div
            className="rise mt-10 flex w-full flex-wrap items-center justify-center gap-3"
            style={rise(2)}
          >
            <DownloadMenu variant="hero" />
          </div>
        </div>
      </div>
    </HeroPin>
  );
}
