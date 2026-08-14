"use client";

import Image from "next/image";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { type OtherProject, otherWork } from "@/lib/otherWork";
import Reveal from "./Reveal";

/**
 * Inverted section — light concrete on dark page — so it reads as outside
 * the Spiral product line.
 *
 * The rail is a plain scroll container with snap points, so it works with a
 * trackpad, a touch drag, and the scrollbar before any JavaScript runs. The
 * arrows are an addition for mouse users, not the mechanism.
 */
export default function OtherWork() {
  const railRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    // 2px slack: fractional scroll positions never land exactly on the end.
    setAtStart(rail.scrollLeft <= 2);
    setAtEnd(rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2);
  }, []);

  useEffect(() => {
    sync();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(sync);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [sync]);

  const page = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    // One card plus its gap, so a click always lands on a snap point.
    const card = rail.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 24 : rail.clientWidth;
    // Explicit "smooth" would override the reduced-motion rule in globals.css,
    // so ask the media query directly.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({ left: step * direction, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <section id="other-work" className="bg-paper text-ink">
      <div className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="flex items-end justify-between gap-6">
              <div>
                <h2 className="type-display text-4xl text-ink sm:text-5xl">
                  Outside the Collection
                </h2>
              </div>
              <div className="hidden shrink-0 gap-2 sm:flex">
                <RailButton
                  direction={-1}
                  disabled={atStart}
                  onClick={() => page(-1)}
                  label="Previous projects"
                />
                <RailButton
                  direction={1}
                  disabled={atEnd}
                  onClick={() => page(1)}
                  label="Next projects"
                />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Full-bleed rail: cards run to the viewport edge so the row reads as
            continuing past it, with the page gutter restored as padding. */}
        <Reveal>
          <ul
            ref={railRef}
            onScroll={sync}
            aria-label="Other work"
            className="work-rail mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-6"
          >
            {otherWork.map((project, i) => (
              <li
                key={project.id}
                className="w-[74vw] max-w-[340px] shrink-0 snap-start sm:w-[340px]"
              >
                <WorkCard project={project} index={i} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/** The tile grid, and the order they clear in.
 *
 *  A fixed shuffle rather than `Math.random()`: the order has to be identical
 *  on the server and the client or React rejects the markup, and it has to be
 *  the same on every card so the effect reads as one behaviour rather than
 *  seven. 8 x 6 is the coarsest grid that still reads as dissolving rather
 *  than as wiping. */
const TILE_COLS = 8;
const TILE_ROWS = 6;
const TILE_COUNT = TILE_COLS * TILE_ROWS;

/** Deterministic shuffle of 0..47, from a fixed seed. */
const TILE_ORDER = (() => {
  const order = Array.from({ length: TILE_COUNT }, (_, i) => i);
  let seed = 20260814;
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
})();

/** Milliseconds between one tile lighting and the next. 48 tiles at 7ms is a
 *  ~330ms sweep; with each tile's own 520ms blink the wash runs about 850ms
 *  end to end, which is one look rather than an animation to sit through. */
const TILE_STEP = 7;

function WorkCard({ project, index }: { project: OtherProject; index: number }) {
  const body = (
    <>
      {/* The work leads. It is on screen from the moment the card is, and
          hovering runs the tiles across it rather than earning it. */}
      <Image
        src={project.cover}
        alt={project.coverAlt}
        width={1200}
        height={750}
        sizes="(max-width: 640px) 80vw, 340px"
        className="absolute inset-0 h-full w-full object-cover object-top"
      />

      {/* Permanent, not hover-only: every label below now sits on a
          photograph, and which photograph is not something this can know. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-3/5"
        style={{
          background: [
            "linear-gradient(180deg, transparent,",
            "color-mix(in oklab, var(--spiral-ink) 55%, transparent) 45%,",
            "color-mix(in oklab, var(--spiral-ink) 92%, transparent))",
          ].join(" "),
        }}
      />

      <div aria-hidden="true" className="absolute inset-0 grid grid-cols-8 grid-rows-6">
        {TILE_ORDER.map((position, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: tiles are a fixed grid; position is the identity
            key={i}
            className="work-tile"
            style={{ "--tile-delay": `${position * TILE_STEP}ms` } as CSSProperties}
          />
        ))}
      </div>

      <div className="relative flex h-full flex-col justify-end p-6">
        <span className="absolute left-6 top-6 flex h-10 w-10 items-center justify-center bg-ink font-mono text-xs text-paper">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="type-heading text-lg text-paper">{project.name}</h3>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-concrete">
          {project.kind}
        </p>
        <p className="mt-3 text-sm text-concrete">{project.description}</p>
      </div>
    </>
  );

  const shell =
    "work-card group relative flex aspect-[4/5] flex-col overflow-hidden border border-conc3 bg-conc1";

  // No link, so no link affordance: an unlinked card washes its tiles and does
  // nothing else. It used to keep the hover-lift and the image scale of the
  // linked version, which promised a destination seven times over.
  if (!project.href) return <article className={shell}>{body}</article>;

  return (
    <a
      href={project.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${shell} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red`}
    >
      {body}
    </a>
  );
}

function RailButton({
  direction,
  disabled,
  onClick,
  label,
}: {
  direction: 1 | -1;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center border border-conc3 text-ink transition-colors hover:bg-conc1 disabled:cursor-not-allowed disabled:text-steel disabled:hover:bg-transparent"
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={direction === 1 ? "M5 12h14M13 6l6 6-6 6" : "M19 12H5M11 18l-6-6 6-6"} />
      </svg>
    </button>
  );
}
