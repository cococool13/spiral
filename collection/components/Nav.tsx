"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apps } from "@/lib/apps";
import DownloadMenu from "./DownloadMenu";
import Mark from "./Mark";

/**
 * Floating glass pill nav — sits 24px below the top, never flush at y=0.
 *
 * On the home hero it stays off-screen until the visitor scrolls a little,
 * so the photograph is the first thing they see. App pages show it at once.
 * Keyboard focus reveals it immediately so it cannot trap a tab stop.
 */
export default function Nav() {
  const pathname = usePathname();
  // `trailingSlash: true`, so `/wallpaper/` is the real path — compare without
  // the slash so a missing or extra one cannot silently un-match.
  const trimmed = pathname?.replace(/\/$/, "") ?? "";
  const home = trimmed === "";
  const current = apps.find((app) => app.page && app.page.replace(/\/$/, "") === trimmed);
  const [revealed, setRevealed] = useState(!home);

  useEffect(() => {
    if (!home) {
      setRevealed(true);
      return;
    }
    const onScroll = () => setRevealed(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [home]);

  return (
    <header
      className={`nav-bar fixed inset-x-0 top-[calc(1.5rem+env(safe-area-inset-top,0px))] z-50 flex justify-center px-4 ${
        revealed ? "nav-bar--in" : ""
      }`}
      onFocusCapture={() => setRevealed(true)}
    >
      <nav className="nav-pill flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2 sm:px-5">
        {/* min-h-11 = 44px: the mark is 24×24, so the link still needs its
            own hit area. Stroke mark — never a CSS mask (masks drop strokes). */}
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="/"
            className="flex min-h-11 items-center gap-3 focus-visible:outline-2 focus-visible:outline-red"
          >
            <Mark size={24} className="text-red" />
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
