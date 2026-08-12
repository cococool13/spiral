"use client";

import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import { SLIM_POLICIES } from "@/lib/slimPolicies";
import { useCrossfade } from "@/lib/useCrossfade";

/**
 * The collection, one app at a time.
 *
 * Each panel shows the truest thing that app has rather than a picture of a
 * window: Wallpaper what it costs to run, Slim the policy names it writes,
 * Resume a real render from its own typesetting engine, Clean the rule that
 * decides what it may destroy. Nothing here is a mockup, which is the only way
 * a page about small honest tools can look expensive without lying.
 */
interface Panel {
  slug: string;
  name: string;
  line: string;
  href: string;
  status: string;
  artifact: "cost" | "policies" | "sheet" | "verdicts";
}

const PANELS: Panel[] = [
  {
    slug: "wallpaper",
    name: "Wallpaper",
    line: "Click a wallpaper. It downloads, it is checked, it is your desktop.",
    href: "/wallpaper/",
    status: "Out now · 1.0.3",
    artifact: "cost",
  },
  {
    slug: "slim",
    name: "Slim",
    line: "Turns off the telemetry your browser ships with, after showing you every switch.",
    href: "/slim/",
    status: "Out now · 1.0.0",
    artifact: "policies",
  },
  {
    slug: "resume",
    name: "Resume",
    line: "Twelve typeset layouts, and a model that is never allowed to change a fact.",
    href: "/resume/",
    status: "Not out yet",
    artifact: "sheet",
  },
  {
    slug: "clean",
    name: "Clean",
    line: "Removes caches and uninstalls apps, and mostly it moves things to the Trash.",
    href: "/clean/",
    status: "Not out yet · macOS",
    artifact: "verdicts",
  },
];

const COST = [
  { value: "4.6 MB", label: "Binary" },
  { value: "95 MB", label: "Idle memory" },
  { value: "< 1s", label: "Window on screen" },
  { value: "0", label: "Background processes" },
];

const VERDICTS = [
  {
    verdict: "Deleted for good",
    detail: "Only the safe-category catalogue",
    tone: "text-red",
  },
  {
    verdict: "Moved to the Trash",
    detail: "Everything else it removes",
    tone: "text-paper",
  },
  { verdict: "Never touched", detail: "Anything you made", tone: "text-gray" },
];

function Artifact({ kind }: { kind: Panel["artifact"] }) {
  if (kind === "cost") {
    return (
      <dl className="grid grid-cols-2 gap-px border border-gray/25">
        {COST.map((c) => (
          <div key={c.label} className="p-6">
            <dd className="type-display text-3xl text-paper sm:text-4xl">{c.value}</dd>
            <dt className="type-eyebrow mt-3 text-gray">{c.label}</dt>
          </div>
        ))}
      </dl>
    );
  }
  if (kind === "policies") {
    return (
      // One column, not two: at half the page width a second column forces
      // names like BraveTrackingQueryParametersFilteringEnabled to break
      // mid-word, which reads as broken rather than dense.
      <div className="border border-gray/25 p-6">
        <ul className="space-y-1 font-mono text-xs text-gray">
          {SLIM_POLICIES.slice(0, 14).map((policy) => (
            <li key={policy}>{policy}</li>
          ))}
        </ul>
        <p className="mt-6 border-t border-gray/25 pt-4 font-mono text-xs text-paper">
          and {SLIM_POLICIES.length - 14} more
        </p>
      </div>
    );
  }
  if (kind === "sheet") {
    return (
      <Image
        src="/resume/ledger.svg"
        alt="A resume typeset by Spiral Resume"
        width={612}
        height={792}
        loading="lazy"
        className="mx-auto h-[46vh] w-auto bg-paper"
      />
    );
  }
  return (
    <ol className="grid grid-cols-1 gap-px border border-gray/25">
      {VERDICTS.map((v) => (
        <li key={v.verdict} className="p-6">
          <p className={`type-heading text-lg ${v.tone}`}>{v.verdict}</p>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-gray">
            {v.detail}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Stage({
  panel,
  index,
  progress,
}: {
  panel: Panel;
  index: number;
  progress: MotionValueProgress;
}) {
  const { opacity, y, scale } = useCrossfade(progress, index, PANELS.length);
  return (
    <m.div
      className="absolute inset-0 grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16"
      style={{ opacity, y, scale }}
    >
      <div>
        <p className="type-eyebrow text-paper">{panel.status}</p>
        <h3 className="type-display mt-4 text-5xl text-paper sm:text-6xl">
          {panel.name}
        </h3>
        <p className="mt-6 max-w-md text-lg text-gray">{panel.line}</p>
        <a
          href={panel.href}
          className="mt-8 inline-flex items-center font-mono text-xs uppercase tracking-widest text-paper underline-offset-8 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:underline focus-visible:outline-2 focus-visible:outline-red"
        >
          What it does
        </a>
      </div>
      <div className="hidden lg:block">
        <Artifact kind={panel.artifact} />
      </div>
    </m.div>
  );
}

type MotionValueProgress = ReturnType<typeof useScroll>["scrollYProgress"];

export default function Showcase() {
  const stage = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: stage,
    offset: ["start start", "end end"],
  });
  const index = useTransform(scrollYProgress, (v) =>
    Math.min(PANELS.length - 1, Math.floor(v * PANELS.length)),
  );

  if (reduced) return <Stacked />;

  return (
    <>
      {/* Below lg the artifacts are hidden anyway, so the sticky version would
          be 360vh of scroll for four sentences. The stacked list says the same
          thing in the space it needs. */}
      <div className="lg:hidden">
        <Stacked />
      </div>
      <section
        ref={stage}
        aria-label="The apps, one at a time"
        style={{ height: `${PANELS.length * 90}vh` }}
        className="relative hidden lg:block"
      >
        <div className="sticky top-0 flex h-screen items-center overflow-hidden pt-24 pb-16">
          <div className="relative mx-auto h-full w-full max-w-6xl px-6">
            {PANELS.map((panel, i) => (
              <Stage
                key={panel.slug}
                panel={panel}
                index={i}
                progress={scrollYProgress}
              />
            ))}
            <Counter index={index} />
          </div>
        </div>
      </section>
    </>
  );
}

/** The same four apps without the sequence: used below `lg`, and whenever the
 *  reader has asked for reduced motion. */
function Stacked() {
  return (
    <section aria-label="The apps" className="mx-auto max-w-6xl px-6 py-32">
      <ul className="grid grid-cols-1 gap-16">
        {PANELS.map((panel) => (
          <li key={panel.slug} className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="type-eyebrow text-paper">{panel.status}</p>
              <h3 className="type-display mt-4 text-4xl text-paper">{panel.name}</h3>
              <p className="mt-4 max-w-md text-gray">{panel.line}</p>
              <a
                href={panel.href}
                className="mt-6 inline-block font-mono text-xs uppercase tracking-widest text-paper underline-offset-8 hover:underline"
              >
                What it does
              </a>
            </div>
            <Artifact kind={panel.artifact} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Which of the four is on screen. Without it the section is a handsome blur. */
function Counter({ index }: { index: MotionValueProgress }) {
  const label = useTransform(
    index,
    (v) => `${String(Math.round(v) + 1).padStart(2, "0")} / 0${PANELS.length}`,
  );
  return (
    <m.p className="absolute bottom-0 left-6 font-mono text-xs tracking-widest text-gray">
      {label}
    </m.p>
  );
}
