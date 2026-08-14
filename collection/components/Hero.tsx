import type { CSSProperties } from "react";
import { apps } from "@/lib/apps";
import DownloadMenu from "./DownloadMenu";
import HeroOrbit from "./HeroOrbit";
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

const shipped = apps.filter((a) => a.status === "live").length;
const inProgress = apps.length - shipped;

/** Entrance: one curve, staggered by a rung. `.rise` and its reduced-motion
 *  path live in globals.css — see there for why this is CSS and not framer. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * The hero: a claim on the left, the mark in orbit on the right, and a low
 * red dawn coming up under both of them.
 *
 * The split is deliberate. Centred, the hero could only ever say the brand
 * name; off-centre it can say the name *and* show what the name is, which is
 * the one thing a visitor has to understand before anything below matters.
 */
export default function Hero() {
  return (
    /* `overflow-x-clip`, not `overflow-hidden`. The section has to clip
       horizontally — the orbit's strokes reach ~29px past their box — but
       `hidden` also clipped vertically, and the download panel opens downward
       from inside here. At 1280x720 that cut 137px off the panel, including
       the whole Windows-signing note and 49px of the second app's download
       button. `clip` on one axis is the one form that leaves the other
       genuinely `visible`. */
    <section id="top" className="relative flex min-h-svh flex-col overflow-x-clip">
      <HeroAtmosphere />

      {/* Above the claims rail, not level with it: the download menu opens
          downward into that band, and equal z-index let the rail paint over
          the open panel. */}
      <div className="relative z-20 flex flex-1 items-center px-6 pb-16 pt-32 sm:pb-20 lg:pb-16 lg:pt-28">
        {/* The split is as far toward the figure as the headline allows: at
            1.17fr the claim column is 645px and "Small software." needs 615px
            at its largest step. Any wider a figure and the headline breaks. */}
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.17fr_0.83fr] lg:gap-12">
          {/* Claim */}
          <div>
            <div
              className="rise inline-flex items-center border border-white/15 bg-black/40 px-4 py-2 backdrop-blur-sm"
              style={rise(0)}
            >
              <span className="type-eyebrow text-concrete">
                {shipped} shipped · {inProgress} in progress
              </span>
            </div>

            <h1
              /* Five steps because the column changes width five times. The
                 headline is two lines by design, and "Small software." is
                 ~9.6× the font size wide, so each step is the largest that
                 still clears its own column — including the dip at `lg`,
                 where the single column becomes the narrower of two. */
              className="rise type-display mt-7 text-[2rem] text-paper sm:text-5xl md:text-6xl lg:text-[3.25rem] xl:text-[4rem]"
              style={rise(1)}
            >
              Spiral.
              <br />
              Small software.
            </h1>

            <p
              className="rise mt-6 max-w-lg text-base leading-relaxed text-concrete sm:text-lg"
              style={rise(2)}
            >
              Desktop tools that do one job each. No accounts, no telemetry, no background
              process.
            </p>

            <div
              className="rise mt-9 flex flex-wrap items-center gap-x-8 gap-y-4"
              style={rise(3)}
            >
              <DownloadMenu />
              <a
                href="/#apps"
                className="group inline-flex min-h-11 items-center gap-2 font-mono text-sm text-gray transition-colors hover:text-paper"
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

          {/* Figure. Stacked below the claim, never above it — a phone-sized
              screen that opens on the mark alone has said nothing yet. */}
          <div className="rise rise--figure" style={rise(1)}>
            <HeroOrbit />
          </div>
        </div>
      </div>

      {/* The three claims the whole collection is built on, as the hero's base */}
      <div className="rise relative z-10 border-t border-white/10" style={rise(4)}>
        <div className="mx-auto grid max-w-6xl gap-7 px-6 py-8 text-left sm:grid-cols-3 sm:gap-10">
          {pillars.map((p) => (
            <div key={p.title}>
              <h2 className="type-eyebrow text-paper">{p.title}</h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The room the hero stands in: a near-black base, the interactive lattice, a
 * low dawn of oxblood turning to helix red at the bottom-left, grain, and a
 * vignette to hold the headline.
 *
 * The light is low and off to one side on purpose — a fixture in the room
 * rather than a surface that glows on its own. Every colour here is mixed from
 * a brand token; nothing is a one-off value.
 *
 * (This replaced a centred lattice hero, which in turn replaced a code-rendered
 * concrete warehouse interior. That one is recoverable from commit 7ccf37a.)
 */
function HeroAtmosphere() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* Base: night interior, the floor a touch warmer than the ceiling */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(180deg,",
            "var(--spiral-black) 0%,",
            "color-mix(in oklab, var(--spiral-black) 94%, var(--spiral-paper)) 44%,",
            "color-mix(in oklab, var(--spiral-black) 90%, var(--spiral-oxblood)) 76%,",
            "var(--spiral-black) 100%)",
          ].join(" "),
        }}
      />

      <InteractiveGrid />

      {/* Vignette. Painted before the dawn, not after — behind it the corner
          the light comes from was the corner being darkened, and the light
          read as a smudge. */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(118% 88% at 34% 42%, transparent 48%,",
            "color-mix(in oklab, var(--spiral-black) 70%, transparent) 100%)",
          ].join(" "),
        }}
      />

      {/* The dawn: one light, low and off to the left, in three passes.
          Oxblood spread wide, helix red inside it, and a small paper-warm core
          at the hottest point — the same order a real filament goes through.
          Its centre sits below the fold, so the claim reads over the falloff
          and never over the core. */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background: [
            "radial-gradient(84% 74% at 12% 94%,",
            "var(--spiral-oxblood),",
            "color-mix(in oklab, var(--spiral-oxblood) 34%, transparent) 44%,",
            "transparent 78%)",
          ].join(" "),
        }}
      />
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background: [
            "radial-gradient(46% 38% at 9% 97%,",
            "color-mix(in oklab, var(--spiral-red) 72%, transparent),",
            "transparent 76%)",
          ].join(" "),
          filter: "blur(30px)",
        }}
      />
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background: [
            "radial-gradient(18% 15% at 5% 100%,",
            "color-mix(in oklab, var(--spiral-paper) 52%, transparent),",
            "transparent 72%)",
          ].join(" "),
          filter: "blur(26px)",
        }}
      />

      {/* Film grain */}
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[.07]">
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="2"
            seed="3"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* Base scrim. The dawn is bright exactly where the three claims sit, so
          the bottom edge gets its contrast back before they are drawn. */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(180deg, transparent 68%,",
            "color-mix(in oklab, var(--spiral-black) 34%, transparent) 86%,",
            "color-mix(in oklab, var(--spiral-black) 62%, transparent) 100%)",
          ].join(" "),
        }}
      />
    </div>
  );
}
