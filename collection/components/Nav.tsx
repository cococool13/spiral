"use client";

import { usePathname } from "next/navigation";
import { apps } from "@/lib/apps";
import DownloadMenu from "./DownloadMenu";

/**
 * Floating glass pill nav — sits 24px below the top, never flush at y=0.
 *
 * Download is a disclosure, not a direct file. It used to be a pill reading
 * "Download for" plus a platform glyph, wired to Spiral Wallpaper on every
 * page: it named no app, no version and no size, and it competed with the
 * hero chooser by being the higher primary. The control is back because a
 * visitor who has left the hero still needs a way to get a binary — but it
 * opens the same published-app list the hero does, so the file they get is
 * one they picked.
 *
 * Section links are written absolute (`/#apps`, not `#apps`) because the nav
 * renders on the app pages too, where a bare hash would resolve against that
 * route and go nowhere.
 */
export default function Nav() {
  const pathname = usePathname();
  // `trailingSlash: true`, so `/wallpaper/` is the real path — compare without
  // the slash so a missing or extra one cannot silently un-match.
  const trimmed = pathname?.replace(/\/$/, "") ?? "";
  const current = apps.find((app) => app.page && app.page.replace(/\/$/, "") === trimmed);
  return (
    <header className="fixed inset-x-0 top-[calc(1.5rem+env(safe-area-inset-top,0px))] z-50 flex justify-center px-4">
      <nav className="nav-pill flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2 sm:px-5">
        {/* min-h-11 = 44px: the mark and wordmark are only 20px tall, so the
            link needs its own hit area. */}
        <div className="flex min-w-0 items-center gap-3">
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
        <div className="flex items-center gap-1 font-mono text-xs text-gray sm:gap-2">
          <a
            href="/#apps"
            className="inline-flex min-h-11 items-center px-2 transition-colors hover:text-paper"
          >
            Apps
          </a>
          <a
            href="/#other-work"
            className="inline-flex min-h-11 items-center px-2 transition-colors hover:text-paper"
          >
            Other Work
          </a>
          <DownloadMenu variant="nav" />
        </div>
      </nav>
    </header>
  );
}
