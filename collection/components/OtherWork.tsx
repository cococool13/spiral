"use client";

import Image from "next/image";
import { type CSSProperties, useId, useState } from "react";
import { type OtherProject, otherWork } from "@/lib/otherWork";
import Reveal from "./Reveal";

/**
 * Inverted section — light concrete on dark page — so it reads as outside
 * the Spiral product line.
 *
 * The seven projects are a deck. Closed, they sit stacked with each one
 * peeking out from under the one above; opened, they spread into a list you
 * can read. It is one control and one piece of state, which is the honest
 * shape for a section that is a footnote to the collection rather than part
 * of it: it takes one line of the page until someone wants it.
 *
 * The stack is `margin-top`, not `transform`. A transform would slide the
 * rows over each other and leave the section its full height either way,
 * which is the opposite of collapsing. Seven rows transitioning one property
 * on one click is a cost worth paying to have the page actually get shorter.
 */
export default function OtherWork() {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <section id="other-work" className="bg-paper text-ink">
      <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div>
              <h2 className="type-display text-4xl text-ink sm:text-5xl">
                Outside the Collection
              </h2>
              <p className="mt-3 text-sm text-steel">
                {otherWork.length} things built for other people.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={listId}
              className="inline-flex min-h-11 items-center gap-2 border border-conc3 px-4 font-mono text-xs uppercase tracking-widest text-ink transition-colors hover:bg-conc1"
            >
              {open ? "Collapse" : "Open the stack"}
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`transition-transform duration-500 ease-spiral ${
                  open ? "rotate-180" : ""
                }`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </Reveal>

        <Reveal>
          <ol
            id={listId}
            className={`work-stack mt-12 ${open ? "is-open" : ""}`}
            // The peek is what a closed row shows of itself. Read by the CSS
            // so the two cannot disagree about how tall the stack is.
            style={{ "--peek": "1.75rem" } as CSSProperties}
          >
            {otherWork.map((project, i) => (
              <li
                key={project.id}
                // Closed, only the top card is readable — the rest are a peek
                // of edge. `inert` takes them out of the tab order and the
                // accessibility tree together, so a keyboard user does not
                // collect six stops on cards they cannot read. The button's
                // `aria-expanded` is what says they are there.
                inert={!open && i > 0 ? true : undefined}
                style={{ "--i": i, zIndex: otherWork.length - i } as CSSProperties}
              >
                <ProjectRow project={project} index={i} />
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

function ProjectRow({ project, index }: { project: OtherProject; index: number }) {
  const body = (
    <>
      {/* 16:10, the covers' own ratio, not a square. Cropped square to 80px
          these landed in the middle of a page of body copy and every one came
          out a white rectangle. */}
      <span className="relative aspect-[16/10] w-20 shrink-0 overflow-hidden border border-conc3 bg-conc1 sm:w-32">
        <Image
          src={project.cover}
          alt={project.coverAlt}
          width={1200}
          height={750}
          sizes="128px"
          className="h-full w-full object-cover object-top"
        />
      </span>
      {/* The row is a fixed height so the collapse maths hold, so nothing in
          here may grow past two lines. On a phone that means the number, the
          kind and the name only — a description truncated to "Marketing sit…"
          is not worth the line it wraps onto. */}
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] uppercase tracking-widest text-steel">
          {String(index + 1).padStart(2, "0")} · {project.kind}
        </span>
        <span className="type-heading mt-1 line-clamp-2 block text-base text-ink sm:text-lg">
          {project.name}
        </span>
        <span className="mt-1 hidden truncate text-sm text-steel sm:block">
          {project.description}
        </span>
      </span>
      {/* A chevron only where it leads somewhere. Six of the seven have no
          link yet, and an arrow on those is a promise the card cannot keep. */}
      {project.href ? (
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
          className="shrink-0 text-steel transition-transform duration-300 ease-spiral group-hover:translate-x-1"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      ) : (
        <span className="hidden shrink-0 font-mono text-[11px] uppercase tracking-widest text-steel sm:inline">
          Not public
        </span>
      )}
    </>
  );

  // Opaque, not `bg-white/60`. A stack of translucent cards lets every buried
  // title print through the one on top, which reads as a rendering fault
  // rather than as a deck.
  const shell =
    "group flex w-full items-center gap-4 border border-conc3 bg-conc1 p-4 text-left sm:gap-6 sm:p-5";

  if (!project.href) return <article className={shell}>{body}</article>;

  return (
    <a
      href={project.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${shell} transition-colors hover:bg-conc2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red`}
    >
      {body}
    </a>
  );
}
