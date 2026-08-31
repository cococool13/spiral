import type { CSSProperties } from "react";
import DownloadMenu from "./DownloadMenu";
import HeroPin from "./HeroPin";

/** Entrance: one curve, staggered by a rung. `.rise` lives in globals.css. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * Full-viewport still, type in the middle, and a plate that zooms out on
 * scroll — the signature Superwhisper move adapted to Spiral's palette.
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
            src="/brand/hero/hero-exit.webp"
            alt="A dark corridor with daylight at the far door."
            width={2400}
            height={1350}
            fetchPriority="high"
            className="hero-photo"
          />
          <div aria-hidden="true" className="hero-wash" />
        </div>

        <div className="hero-copy">
          <h1
            className="rise type-display text-4xl text-paper sm:text-5xl"
            style={rise(0)}
          >
            No account. No bloat. No tracking.
          </h1>

          <div
            className="rise mt-8 flex w-full flex-wrap items-center justify-center gap-3"
            style={rise(1)}
          >
            <DownloadMenu variant="hero" />
          </div>
        </div>
      </div>
    </HeroPin>
  );
}
