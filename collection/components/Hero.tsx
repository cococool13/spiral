import type { CSSProperties } from "react";
import { apps } from "@/lib/apps";
import DownloadMenu from "./DownloadMenu";
import GlassPillCTA from "./GlassPillCTA";
import Mark from "./Mark";

const wallpaper = apps.find((app) => app.slug === "wallpaper");

/** Entrance: one curve, staggered by a rung. `.rise` lives in globals.css. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * Full-viewport still, type, then the Wallpaper download. The header stays
 * off this screen until scroll. The mark sits with the headline.
 *
 * Photograph: Unsplash, red spiral staircase
 * https://unsplash.com/photos/7s0-Sjs97sk
 */
export default function Hero() {
  return (
    <section id="top" className="relative min-h-svh">
      <div className="relative flex min-h-svh flex-col">
        <div className="absolute inset-0 bg-black">
          {/* biome-ignore lint/performance/noImgElement: still is the LCP image */}
          <img
            src="/images/hero-red.webp"
            alt="Looking down a red spiral staircase in a dark interior."
            width={2400}
            height={1601}
            fetchPriority="high"
            className="hero-photo h-full w-full"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background: "color-mix(in oklab, var(--spiral-void) 18%, transparent)",
            }}
          />
        </div>

        <div className="hero-copy relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="rise text-red" style={rise(0)}>
            <Mark size={40} />
          </div>
          <h1
            className="rise type-display mt-6 text-paper"
            style={{
              ...rise(1),
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
            style={rise(2)}
          >
            No account. No bloat. No tracking.
          </p>

          <div
            className="rise mt-10 flex flex-wrap items-center justify-center gap-3"
            style={rise(3)}
          >
            {wallpaper ? <GlassPillCTA app={wallpaper} /> : null}
            <DownloadMenu />
          </div>
        </div>
      </div>
    </section>
  );
}
