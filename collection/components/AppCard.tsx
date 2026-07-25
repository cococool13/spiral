import type { SpiralApp } from "@/lib/apps";
import DemoVideo from "./DemoVideo";
import GlassPillCTA, { DisabledPill } from "./GlassPillCTA";

export default function AppCard({ app }: { app: SpiralApp }) {
  const live = app.status === "live";
  return (
    <article className="flex flex-1 flex-col gap-6 rounded-[2px] border border-white/10 bg-white/[.02] p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center border border-white/15 rounded-[2px]">
            <svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              stroke={live ? "var(--spiral-red)" : "var(--spiral-gray)"}
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
        <span className="font-mono text-[11px] uppercase tracking-widest text-gray whitespace-nowrap">
          {live ? (
            <>
              <span className="text-red">Live</span>
              {app.version && <span className="ml-2">v{app.version}</span>}
            </>
          ) : (
            "Coming soon"
          )}
        </span>
      </div>

      {live && app.video && <DemoVideo video={app.video} name={app.name} />}

      <div className="mt-auto flex items-center gap-4">
        {live && app.downloads ? (
          <>
            <GlassPillCTA downloads={app.downloads} />
            <a
              href={app.downloads.all}
              className="font-mono text-xs text-gray underline-offset-4 transition-colors hover:text-paper hover:underline"
            >
              All downloads
            </a>
          </>
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
