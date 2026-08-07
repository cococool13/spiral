"use client";

import { useScroll } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import WordReveal from "./WordReveal";

/**
 * The ride.
 *
 * Eight full-height panels of scroll drive one number into `progress`, which
 * the WebGL corridor reads every frame. The DOM layer stays almost empty on
 * purpose — the argument here is the motion, not the copy — so the only text
 * is the title, the tagline moment, and the way out.
 *
 * The corridor is a `next/dynamic` import with `ssr: false`. Three and the
 * post-processing stack are roughly 200 kB, and none of it may touch the home
 * page bundle: this route pays for itself and no other route does.
 */

const CorridorScene = dynamic(() => import("./CorridorScene"), {
  ssr: false,
  loading: () => <div className="cool-loading" />,
});

const ACTS = ["01", "02", "03", "04", "05"];

/** Eight panels of scroll, five places. The underpass, the street and the room
 *  each get two panels so they have room to breathe. Index into ACTS by panel. */
const PANEL_ACT = [0, 0, 1, 1, 2, 3, 4, 4];

export default function CoolJourney() {
  const progress = useRef(0);
  const { scrollYProgress } = useScroll();
  const [act, setAct] = useState(0);
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    progress.current = scrollYProgress.get();
    return scrollYProgress.on("change", (v) => {
      progress.current = v;
    });
  }, [scrollYProgress]);

  // Act index for the rail. Observed, not computed from scroll, so the React
  // tree re-renders a handful of times across the whole page instead of once
  // per frame.
  useEffect(() => {
    const panels = document.querySelectorAll<HTMLElement>("[data-panel]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const panel = Number(e.target.getAttribute("data-panel"));
          setAct(PANEL_ACT[panel] ?? 0);
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    for (const p of panels) io.observe(p);
    return () => io.disconnect();
  }, []);

  return (
    <div className="cool-root" data-static={reduced ? "true" : "false"}>
      <div className="cool-stage" aria-hidden="true">
        {reduced === false && <CorridorScene progress={progress} />}
      </div>

      {/* Decorative chapter rail. Not a nav landmark — there is nothing to
          navigate to, so announcing it would only add noise. */}
      <div className="cool-rail" aria-hidden="true">
        <span className="cool-rail-track">
          <span className="cool-rail-fill" />
        </span>
        <ol>
          {ACTS.map((label, i) => (
            <li key={label} data-active={i === act ? "true" : "false"}>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <main className="cool-scroll">
        <section data-panel="0" className="cool-panel cool-panel--intro">
          <h1 className="cool-title">Cool</h1>
          <span className="cool-cue">Scroll</span>
        </section>

        <section data-panel="1" className="cool-panel" aria-hidden="true" />
        <section data-panel="2" className="cool-panel" aria-hidden="true" />
        <section data-panel="3" className="cool-panel" aria-hidden="true" />
        <section data-panel="4" className="cool-panel" aria-hidden="true" />

        {/* Lands in act 4, the room, where the ride has stopped and the left
            half of the frame is in shade. */}
        <section data-panel="5" className="cool-panel cool-panel--tagline">
          <WordReveal
            lines={[
              "A website can be a place",
              "you move through, not a page",
              "you scroll past.",
            ]}
          />
        </section>

        <section data-panel="6" className="cool-panel" aria-hidden="true" />

        <section data-panel="7" className="cool-panel cool-panel--outro">
          <span
            className="cool-mark"
            aria-hidden="true"
            style={{
              maskImage: "url(/brand/logo/mark.svg)",
              WebkitMaskImage: "url(/brand/logo/mark.svg)",
            }}
          />
          <h2 className="cool-outro-title">Same tokens. Longer night.</h2>
          <a href="/" className="cool-exit">
            Back to Spiral
          </a>
        </section>
      </main>
    </div>
  );
}
