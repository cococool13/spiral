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
  const work = trimmed === "/work";
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
      className={`nav-shell fixed inset-x-0 top-[calc(1.5rem+env(safe-area-inset-top,0px))] z-50 px-4 ${
        revealed ? "" : "pointer-events-none"
      }`}
      onFocusCapture={() => setRevealed(true)}
    >
      <div className={`nav-bar ${revealed ? "nav-bar--in" : ""}`}>
        <nav className="nav-pill mx-auto grid w-full min-w-0 max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3 justify-self-start">
            <a
              href="/"
              className="flex min-h-11 items-center gap-3 focus-visible:outline-2 focus-visible:outline-red"
            >
              <Mark size={24} className="text-red" />
              <span className="type-heading hidden text-sm tracking-wide sm:inline">
                Spiral
              </span>
            </a>
            {current ? (
              <span
                aria-current="page"
                className="hidden border-l border-gray/30 pl-3 font-mono text-xs text-paper sm:block"
              >
                {current.name.replace("Spiral ", "")}
              </span>
            ) : null}
          </div>

          <div className="nav-download justify-self-center">
            <DownloadMenu />
          </div>

          <div className="flex items-center justify-self-end gap-2 sm:gap-3">
            <a
              href="/privacy/"
              aria-current={trimmed === "/privacy" ? "page" : undefined}
              className="hidden min-h-11 items-center px-2 text-sm text-gray transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-red sm:inline-flex"
            >
              Privacy
            </a>
            <a
              href="/work/"
              aria-current={work ? "page" : undefined}
              className="glass-pill glass-pill--secondary glass-pill--nav"
            >
              <span className="sm:hidden">Work</span>
              <span className="hidden sm:inline">Other Work</span>
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
