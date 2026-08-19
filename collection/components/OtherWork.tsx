"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useState } from "react";
import { countLine, KIND_FILTERS, type OtherProject, otherWork } from "@/lib/otherWork";

type KindFilter = (typeof KIND_FILTERS)[number];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Inverted section — light concrete on dark page — so it reads as outside
 * the Spiral product line.
 *
 * The seven projects are an editorial index, not a stack. Closed stacks hid
 * six of seven; this list is always on the page. Desktop is a numbered index
 * with a large 16:10 cover that follows hover and keyboard. Mobile is stacked
 * plates. Kind filters cut the list; they do not hide that the work exists.
 */
export default function OtherWork() {
  const [kind, setKind] = useState<KindFilter>("All");
  const filtered = useMemo(
    () => (kind === "All" ? otherWork : otherWork.filter((p) => p.kind === kind)),
    [kind],
  );
  const [activeId, setActiveId] = useState(filtered[0]?.id ?? otherWork[0].id);
  const listId = useId();
  const coverId = useId();

  useEffect(() => {
    if (!filtered.some((p) => p.id === activeId)) {
      setActiveId(filtered[0]?.id ?? otherWork[0].id);
    }
  }, [filtered, activeId]);

  const active = filtered.find((p) => p.id === activeId) ?? filtered[0];
  const activeIndex = otherWork.findIndex((p) => p.id === active?.id);

  function move(delta: number) {
    if (!filtered.length) return;
    const i = filtered.findIndex((p) => p.id === activeId);
    const next = filtered[Math.max(0, Math.min(filtered.length - 1, i + delta))];
    if (next) setActiveId(next.id);
  }

  return (
    <section id="other-work" className="bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <h2 className="type-display text-4xl text-ink sm:text-5xl">
              Outside the Collection
            </h2>
            <p className="mt-4 text-sm text-steel" aria-live="polite">
              {countLine(kind, filtered.length)}
            </p>
          </div>
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">Filter by kind</legend>
            {KIND_FILTERS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cx("kind-chip", kind === k && "is-on")}
              >
                {k}
              </button>
            ))}
          </fieldset>
        </div>

        <div className="mt-16 hidden lg:grid lg:grid-cols-2 lg:items-start lg:gap-16">
          <ol
            id={listId}
            aria-label="Other work"
            className="border-t border-ink/10"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                move(-1);
              }
            }}
          >
            {filtered.map((project) => {
              const index = otherWork.findIndex((p) => p.id === project.id);
              return (
                <li key={project.id}>
                  <IndexRow
                    project={project}
                    index={index}
                    active={project.id === active?.id}
                    onActivate={() => setActiveId(project.id)}
                  />
                </li>
              );
            })}
          </ol>

          {active ? (
            <div id={coverId} className="sticky top-32">
              <CoverStage project={active} index={activeIndex} />
            </div>
          ) : null}
        </div>

        <ol className="mt-12 grid gap-6 lg:hidden" aria-label="Other work">
          {filtered.map((project) => {
            const index = otherWork.findIndex((p) => p.id === project.id);
            return (
              <li key={project.id}>
                <Plate project={project} index={index} />
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Meta({ project, index }: { project: OtherProject; index: number }) {
  return (
    <span className="font-mono text-micro uppercase tracking-widest text-steel">
      {pad(index + 1)} · {project.kind}
      {project.where ? ` · ${project.where}` : ""}
    </span>
  );
}

function IndexRow({
  project,
  index,
  active,
  onActivate,
}: {
  project: OtherProject;
  index: number;
  active: boolean;
  onActivate: () => void;
}) {
  const className = cx("work-row", active && "is-on");
  const body = (
    <>
      <span className="w-8 shrink-0 pt-0.5 font-mono text-micro tabular-nums text-steel">
        {pad(index + 1)}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-micro uppercase tracking-widest text-steel">
          {project.kind}
          {project.where ? ` · ${project.where}` : ""}
        </span>
        <span className="type-heading mt-1 block text-xl text-ink">{project.name}</span>
        <span className="mt-1 block text-sm leading-relaxed text-steel">
          {project.description}
        </span>
      </span>
      <span className="shrink-0 pt-1 font-mono text-micro uppercase tracking-widest text-steel">
        {project.href ? "Open" : "Not public"}
      </span>
    </>
  );

  if (project.href) {
    return (
      <a
        href={project.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onMouseEnter={onActivate}
        onFocus={onActivate}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-pressed={active}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
    >
      {body}
    </button>
  );
}

function CoverStage({ project, index }: { project: OtherProject; index: number }) {
  return (
    <figure>
      <div className="cover-frame relative aspect-work overflow-hidden bg-concrete">
        <Image
          key={project.id}
          src={project.cover}
          alt={project.coverAlt}
          fill
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="work-cover object-cover object-top"
        />
      </div>
      <figcaption className="mt-5">
        <Meta project={project} index={index} />
        <p className="type-heading mt-2 text-2xl text-ink">{project.name}</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-steel">
          {project.description}
        </p>
      </figcaption>
    </figure>
  );
}

function Plate({ project, index }: { project: OtherProject; index: number }) {
  const inner = (
    <>
      <div className="cover-frame relative aspect-work overflow-hidden bg-concrete">
        <Image
          src={project.cover}
          alt={project.coverAlt}
          fill
          sizes="100vw"
          className="object-cover object-top"
        />
      </div>
      <div className="px-5 py-5">
        <Meta project={project} index={index} />
        <h3 className="type-heading mt-2 text-2xl text-ink">{project.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-steel">{project.description}</p>
        <p className="mt-4 font-mono text-micro uppercase tracking-widest text-steel">
          {project.href ? "Open" : "Not public"}
        </p>
      </div>
    </>
  );

  if (project.href) {
    return (
      <a
        href={project.href}
        target="_blank"
        rel="noopener noreferrer"
        className="work-plate"
      >
        {inner}
      </a>
    );
  }

  return <article className="work-plate">{inner}</article>;
}
