"use client";

import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import { useCrossfade } from "@/lib/useCrossfade";

/** Every sheet is a real render from the app: the same Typst engine that writes
 *  the PDF, run over one sample resume. Nothing here is a mockup, which is the
 *  only honest way to show a page whose product *is* typesetting. */
const SHEETS = [
  { id: "column", name: "Column", note: "Centred, serif, quiet." },
  { id: "blend", name: "Blend", note: "Sans, wide tracking, room to breathe." },
  { id: "ledger", name: "Ledger", note: "Dates in a left rail." },
  { id: "card", name: "Card", note: "A shaded block behind the name." },
  { id: "rule", name: "Rule", note: "A hairline under every section." },
  { id: "timeline", name: "Timeline", note: "Roles read as a run of years." },
];

/** The scroll distance each sheet owns. Enough that a sheet holds still long
 *  enough to be read, not so much that the section outstays its argument. */
const PER_SHEET = 0.85;

function Sheet({
  sheet,
  index,
  progress,
}: {
  sheet: (typeof SHEETS)[number];
  index: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const { opacity, y, scale, off } = useCrossfade(progress, index, SHEETS.length);

  return (
    <m.figure
      // Otherwise every sheet is announced at once, all but one of them
      // invisible, each with its own alt text.
      inert={off || undefined}
      className="absolute inset-0 flex items-center justify-center"
      style={{ opacity, y, scale, visibility: off ? "hidden" : "visible" }}
    >
      <Image
        src={`/resume/${sheet.id}.svg`}
        alt={`A resume set in the ${sheet.name} layout`}
        // The first sheet is the LCP candidate; the rest wait until they are
        // nearly on screen.
        priority={index === 0}
        loading={index === 0 ? "eager" : "lazy"}
        width={612}
        height={792}
        className="h-full w-auto max-w-full bg-paper shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      />
    </m.figure>
  );
}

/** Its own component so `useTransform` is not called inside a loop. */
function RailItem({
  sheet,
  index,
  active,
}: {
  sheet: (typeof SHEETS)[number];
  index: number;
  active: ReturnType<typeof useTransform<number, number>>;
}) {
  const opacity = useTransform(active, (v) => (v === index ? 1 : 0.28));
  return (
    <m.li
      style={{ opacity }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="border-l border-gray/25 py-3 pl-4"
    >
      <p className="type-heading text-base text-paper">{sheet.name}</p>
      <p className="mt-1 text-sm text-gray">{sheet.note}</p>
    </m.li>
  );
}

export default function TemplateSequence() {
  const stage = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: stage,
    offset: ["start start", "end end"],
  });
  const index = useTransform(scrollYProgress, (v) =>
    Math.min(SHEETS.length - 1, Math.floor(v * SHEETS.length)),
  );

  // Reduced motion gets the same content as a plain, readable grid. Every
  // layout is still shown; none of them move.
  if (reduced) {
    return (
      <section aria-label="The twelve layouts" className="mx-auto max-w-6xl px-6 py-24">
        <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {SHEETS.map((sheet) => (
            <li key={sheet.id}>
              <Image
                src={`/resume/${sheet.id}.svg`}
                alt={`A resume set in the ${sheet.name} layout`}
                loading="lazy"
                width={612}
                height={792}
                className="w-full bg-paper"
              />
              <p className="type-heading mt-4 text-lg text-paper">{sheet.name}</p>
              <p className="mt-1 text-sm text-gray">{sheet.note}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      ref={stage}
      aria-label="The layouts, one after another"
      style={{ height: `${SHEETS.length * PER_SHEET * 100}vh` }}
      className="relative"
    >
      {/* The stage is the viewport minus the floating nav pill at the top and a
          little air at the bottom. The sheet then fills what is left, rather
          than sitting at a fixed fraction of it and leaving the column empty. */}
      <div className="sticky top-0 flex h-screen items-center overflow-hidden pt-24 pb-10">
        <div className="mx-auto flex h-full w-full max-w-6xl items-stretch gap-12 px-6">
          {/* The rail names what is on screen. Without it the sequence is
              pretty and mute — the reader cannot tell one layout from another
              by looking at a page of their own words. */}
          <ol className="hidden w-56 shrink-0 self-center lg:block">
            {SHEETS.map((sheet, i) => (
              <RailItem key={sheet.id} sheet={sheet} index={i} active={index} />
            ))}
          </ol>

          <div className="relative h-full flex-1">
            {SHEETS.map((sheet, i) => (
              <Sheet key={sheet.id} sheet={sheet} index={i} progress={scrollYProgress} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
