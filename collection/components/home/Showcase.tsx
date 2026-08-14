"use client";

import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import { appPage } from "@/lib/appPages";
import { apps } from "@/lib/apps";
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

/** The line and the artifact are this section's own; the name, the link and
 *  the status are read from the catalogue. They used to be retyped here, which
 *  is how "Out now · 1.0.3" got frozen into the file while `apps.ts` moved on. */
const PANELS: Panel[] = (
  [
    {
      slug: "wallpaper",
      line: "Click a wallpaper. It downloads, it is checked, it is your desktop.",
      artifact: "cost",
    },
    {
      slug: "slim",
      line: "Turns off the telemetry your browser ships with, after showing you every switch.",
      artifact: "policies",
    },
    {
      slug: "resume",
      line: "Twelve typeset layouts, and a model that is never allowed to change a fact.",
      artifact: "sheet",
    },
    {
      slug: "clean",
      line: "Removes caches and uninstalls apps, and mostly it moves things to the Trash.",
      artifact: "verdicts",
    },
  ] as const
).map((panel) => {
  const app = apps.find((a) => a.slug === panel.slug);
  if (!app?.page) {
    throw new Error(`Showcase panel "${panel.slug}" has no catalogue entry with a page.`);
  }
  return {
    slug: panel.slug,
    name: app.name.replace("Spiral ", ""),
    line: panel.line,
    href: app.page,
    status:
      app.status === "live" && app.version
        ? `Out now · ${app.version}`
        : app.status === "source"
          ? "Source only"
          : "Not out yet",
    artifact: panel.artifact,
  };
});

/** Wallpaper's measured cost, read from its page rather than retyped. The two
 *  copies had already drifted — "Under a second" here had become "< 1s", and
 *  "None" had become "0" — so the same four numbers said different things in
 *  two places on the same site. */
const COST = appPage("wallpaper").facts ?? [];

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
          {/* text-xl, not text-lg. Helix red on near-black is 3.99:1 — it
              clears AA's 3:1 for large text but not the 4.5:1 small text
              needs, and WCAG counts bold as large only from 18.66px. At 18px
              "Deleted for good" was the one verdict that failed; at 20px all
              three pass, and the ladder keeps one size. */}
          <p className={`type-heading text-xl ${v.tone}`}>{v.verdict}</p>
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
  const { opacity, y, scale, off } = useCrossfade(progress, index, PANELS.length);
  return (
    <m.div
      // `visibility` and `inert` together: the first takes it out of the
      // accessibility tree, the second out of the tab order, and both flip
      // with the fade rather than being left behind by it.
      inert={off || undefined}
      className="absolute inset-0 grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16"
      style={{ opacity, y, scale, visibility: off ? "hidden" : "visible" }}
    >
      {/* Name first. The status is a fact about the app, so it sits with the
          action rather than announcing the heading from above it. */}
      <div>
        <h3 className="type-display text-5xl text-paper sm:text-6xl">{panel.name}</h3>
        <p className="mt-6 max-w-md text-lg text-gray">{panel.line}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* The visible words stay short; the accessible name names the app,
              so a screen reader hears four distinct links rather than four
              called "What it does". */}
          <a
            href={panel.href}
            aria-label={`What Spiral ${panel.name} does`}
            className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-widest text-paper underline-offset-8 transition-colors duration-300 hover:underline focus-visible:outline-2 focus-visible:outline-red"
          >
            What it does
          </a>
          <p className="type-eyebrow text-gray">{panel.status}</p>
        </div>
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
        // 70vh a panel, not 90. At 90 the section spent 3,240px of scroll to
        // deliver four sentences, on a page whose argument is that software
        // should be small. 70 keeps roughly one trackpad flick per panel and
        // gives 720px back.
        style={{ height: `${PANELS.length * 70}vh` }}
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
    <section aria-label="The apps" className="mx-auto max-w-6xl px-6 py-24">
      <ul className="grid grid-cols-1 gap-16">
        {PANELS.map((panel) => (
          <li key={panel.slug} className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <h3 className="type-display text-4xl text-paper">{panel.name}</h3>
              <p className="mt-4 max-w-md text-gray">{panel.line}</p>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <a
                  href={panel.href}
                  aria-label={`What Spiral ${panel.name} does`}
                  className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-widest text-paper underline-offset-8 hover:underline"
                >
                  What it does
                </a>
                <p className="type-eyebrow text-gray">{panel.status}</p>
              </div>
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
