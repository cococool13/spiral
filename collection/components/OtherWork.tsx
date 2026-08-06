"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
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
      <div className="py-32 sm:py-40">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="type-eyebrow text-ink">Other Work</p>
                <h2 className="type-display mt-4 text-4xl text-ink sm:text-5xl">
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
            {otherWork.map((project) => (
              <li
                key={project.id}
                className="w-[80vw] max-w-[420px] shrink-0 snap-start sm:w-[420px]"
              >
                <WorkCard project={project} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function WorkCard({ project }: { project: OtherProject }) {
  const body = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden border-b border-conc3 bg-conc1">
        <Image
          src={project.cover}
          alt={project.coverAlt}
          width={1200}
          height={750}
          sizes="(max-width: 640px) 80vw, 420px"
          className="h-full w-full object-cover object-top transition-transform duration-500 ease-spiral group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="type-heading text-lg">{project.name}</h3>
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest text-steel">
            {project.kind}
          </span>
        </div>
        <p className="mt-2 text-sm text-steel">{project.description}</p>
        {project.href && (
          <span className="mt-4 inline-block font-mono text-xs font-medium text-oxblood underline-offset-4 group-hover:underline">
            Visit →
          </span>
        )}
      </div>
    </>
  );

  const shell =
    "group flex h-full flex-col overflow-hidden rounded-[2px] border border-conc3 bg-white/40";

  if (!project.href) return <article className={shell}>{body}</article>;

  return (
    <a
      href={project.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${shell} transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]`}
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
      className="flex h-11 w-11 items-center justify-center rounded-[2px] border border-conc3 text-ink transition-colors hover:bg-conc1 disabled:cursor-not-allowed disabled:text-steel disabled:hover:bg-transparent"
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
