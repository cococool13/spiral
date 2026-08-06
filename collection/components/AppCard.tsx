import type { SpiralApp } from "@/lib/apps";
import GlassPillCTA, { DisabledPill } from "./GlassPillCTA";

export default function AppCard({ app }: { app: SpiralApp }) {
  const live = app.status === "live";
  const source = app.status === "source";
  // Shipped, whether you download it or build it. Drives the red icon and the
  // version number — the two things that say "this one is real".
  const shipped = live || source;
  return (
    <article className="flex flex-1 flex-col gap-6 rounded-[2px] border border-white/10 bg-white/[.02] p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 rounded-[2px]">
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
            <h3 className="type-heading text-lg text-paper">{app.name}</h3>
            <p className="mt-1 text-sm text-gray">{app.tagline}</p>
          </div>
        </div>
        {shipped && (
          <span className="font-mono text-[11px] uppercase tracking-widest text-gray whitespace-nowrap">
            <span className="text-red">{live ? "Live" : "Source"}</span>
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
          <>
            <GlassPillCTA
              downloads={app.downloads}
              noWindowsBinary={app.noWindowsBinary}
            />
            <a
              href={app.downloads.all}
              className="font-mono text-xs text-gray underline-offset-4 transition-colors hover:text-paper hover:underline"
            >
              All downloads
            </a>
          </>
        ) : source && app.source ? (
          <a href={app.source.url} className="glass-pill">
            View the source
          </a>
        ) : (
          <DisabledPill />
        )}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-gray">
          Free
        </span>
      </div>
    </article>
  );
}
