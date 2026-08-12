"use client";

import { usePathname } from "next/navigation";
import { apps } from "@/lib/apps";
import GlassPillCTA from "./GlassPillCTA";

/**
 * Floating glass pill nav — sits 24px below the top, never flush at y=0.
 *
 * The download CTA is the site's one primary action, so it appears only where
 * the page does not already have one. On an app page it would sit above the
 * fold offering a different app's download than the hero directly below it —
 * two primary actions competing, and the wrong one winning by being higher.
 * There, the pill carries the current app's name instead, which is also the
 * only place these pages said which one you were reading.
 *
 * Section links are written absolute (`/#apps`, not `#apps`) because the nav
 * renders on `/cool` and the app pages too, where a bare hash would resolve
 * against that route and go nowhere.
 */
export default function Nav() {
  const wallpaper = apps.find((a) => a.slug === "wallpaper");
  const pathname = usePathname();
  const onCool = pathname?.startsWith("/cool") ?? false;
  // `trailingSlash: true`, so `/wallpaper/` is the real path — compare without
  // the slash so a missing or extra one cannot silently un-match.
  const trimmed = pathname?.replace(/\/$/, "") ?? "";
  const current = apps.find((app) => app.page && app.page.replace(/\/$/, "") === trimmed);
  return (
    <header className="fixed inset-x-0 top-6 z-50 flex justify-center px-4">
      <nav className="nav-pill flex w-full max-w-3xl items-center justify-between gap-4 py-2 pl-5 pr-2">
        {/* min-h-11 = 44px: the mark and wordmark are only 20px tall, so the
            link needs its own hit area. It fits inside the pill's existing
            height, which the 44px download CTA already sets. */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex min-h-11 items-center gap-3 focus-visible:outline-2 focus-visible:outline-red"
          >
            {/* Small filled mark from /brand, recolored paper via CSS mask */}
            <span
              aria-hidden="true"
              className="block h-5 w-5 bg-red"
              style={{
                maskImage: "url(/brand/logo/mark.svg)",
                WebkitMaskImage: "url(/brand/logo/mark.svg)",
                maskSize: "contain",
                WebkitMaskSize: "contain",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskPosition: "center",
                WebkitMaskPosition: "center",
              }}
            />
            <span className="type-heading text-sm tracking-wide">Spiral</span>
          </a>
          {/* Which page this is. The wordmark beside it is the way back. */}
          {current ? (
            <span
              aria-current="page"
              className="hidden border-l border-gray/30 pl-3 font-mono text-xs text-paper sm:block"
            >
              {current.name.replace("Spiral ", "")}
            </span>
          ) : null}
        </div>
        <div className="hidden items-center gap-2 font-mono text-xs text-gray sm:flex">
          <a href="/#apps" className="px-2 py-3 transition-colors hover:text-paper">
            Apps
          </a>
          <a href="/#other-work" className="px-2 py-3 transition-colors hover:text-paper">
            Other Work
          </a>
          <a
            href="/cool/"
            aria-current={onCool ? "page" : undefined}
            className={`px-2 py-3 transition-colors hover:text-paper ${
              onCool ? "text-paper" : ""
            }`}
          >
            Cool
          </a>
        </div>
        {current ? (
          <a
            href="/#apps"
            className="px-3 py-3 font-mono text-xs text-gray transition-colors hover:text-paper"
          >
            All apps
          </a>
        ) : (
          wallpaper?.downloads && <GlassPillCTA downloads={wallpaper.downloads} />
        )}
      </nav>
    </header>
  );
}
