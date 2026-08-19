import type { CSSProperties } from "react";
import DownloadMenu from "./DownloadMenu";

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

/** Entrance: one curve, staggered by a rung. `.rise` lives in globals.css. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * Full-viewport night plate, type, then download. The photograph is sticky
 * so it slides out under the rest of the page on scroll — Superwhisper's move.
 * The mark stays out of this hero.
 */
export default function Hero() {
  return (
    <>
      <section id="top" className="relative">
        <div className="hero-pin">
          <div className="sticky top-0 flex h-svh flex-col">
            <div className="absolute inset-0 bg-black">
              {/* biome-ignore lint/performance/noImgElement: night plate is the LCP still */}
              <img
                src="/images/hero-night.jpg"
                alt=""
                className="hero-photo h-full w-full"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background: "color-mix(in oklab, var(--spiral-void) 28%, transparent)",
                }}
              />
            </div>

            <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
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

              <div className="rise mt-10" style={rise(2)}>
                <DownloadMenu />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 bg-black">
        <div className="mx-auto grid max-w-6xl gap-7 px-6 py-8 text-left sm:grid-cols-3 sm:gap-10">
          {pillars.map((p) => (
            <div key={p.title}>
              <h2 className="type-eyebrow text-paper">{p.title}</h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
