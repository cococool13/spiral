import type { SpiralApp } from "@/lib/apps";
import GlassPillCTA, { DisabledPill } from "./GlassPillCTA";

export default function AppCard({
  app,
  featured = false,
}: {
  app: SpiralApp;
  featured?: boolean;
}) {
  const live = app.status === "live";
  const source = app.status === "source";
  // Shipped, whether you download it or build it. Drives the red icon and the
  // version number — the two things that say "this one is real".
  const shipped = live || source;
  return (
    <article
      className={
        featured
          ? "flex flex-1 flex-col gap-8 border border-white/15 bg-white/[.03] p-8 sm:p-10 sm:flex-row sm:items-end sm:justify-between"
          : "flex flex-1 flex-col gap-6 border border-white/10 bg-white/[.02] p-8"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/15">
            <svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              stroke={shipped ? "var(--spiral-red)" : "var(--spiral-gray)"}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={app.iconPath} />
            </svg>
          </span>
          <div>
            <h3
              className={`type-heading text-paper ${featured ? "text-2xl sm:text-3xl" : "text-lg"}`}
            >
              {app.name}
            </h3>
            <p
              className={`mt-1 text-gray ${featured ? "max-w-md text-base" : "text-sm"}`}
            >
              {app.tagline}
            </p>
          </div>
        </div>
        {/* The status word is paper, not red: at 11px helix red on the card is
            3.85:1 against a 4.5:1 requirement, and small text gets no
            large-text exemption. The red still says "this one is real" — it is
            the icon stroke a few pixels to the left. */}
        {shipped && (
          <span className="font-mono text-[11px] uppercase tracking-widest text-gray whitespace-nowrap">
            <span className="text-paper">{live ? "Live" : "Source"}</span>
            {app.version && <span className="ml-2">v{app.version}</span>}
          </span>
        )}
      </div>

      {/* flex-wrap + min-w-0: at 380px the pill, the downloads link and the
          price label together had a min-content width of ~302px inside a
          268px content box, so the card refused to shrink and pushed the
          document 12px wider than the viewport. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-3">
        {live && app.downloads ? (
          <GlassPillCTA app={app} />
        ) : source && app.source ? (
          <a href={app.source.url} className="glass-pill">
            View the source
          </a>
        ) : app.page ? (
          // Not shipped, but there is something to read. A real link beats a
          // dead pill, and it is the only way anyone reaches the page.
          <a href={app.page} className="glass-pill">
            What it does
          </a>
        ) : (
          <DisabledPill />
        )}
        {/* A shipped app still has a page worth reading; it just leads with the
            download rather than with the reading. */}
        {shipped && app.page ? (
          <a href={app.page} className="glass-pill glass-pill--secondary">
            What it does
          </a>
        ) : null}
      </div>
    </article>
  );
}
