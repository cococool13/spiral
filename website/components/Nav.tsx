"use client";

import GlassPillCTA from "./GlassPillCTA";
import { apps } from "@/lib/apps";

/**
 * Floating glass pill nav — sits 24px below the top, never flush at y=0.
 * Persistent OS-detected download CTA routes to Spiral Wallpaper (the only
 * live app).
 */
export default function Nav() {
  const wallpaper = apps.find((a) => a.slug === "wallpaper");
  return (
    <header className="fixed inset-x-0 top-6 z-50 flex justify-center px-4">
      <nav className="nav-pill flex w-full max-w-3xl items-center justify-between gap-4 py-2 pl-5 pr-2">
        <a
          href="#top"
          className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-red"
        >
          {/* Small filled mark from /branding, recolored paper via CSS mask */}
          <span
            aria-hidden="true"
            className="block h-5 w-5 bg-red"
            style={{
              maskImage: "url(/branding/spiral-mark.svg)",
              WebkitMaskImage: "url(/branding/spiral-mark.svg)",
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
        <div className="hidden items-center gap-2 font-mono text-xs text-gray sm:flex">
          <a href="#apps" className="px-2 py-3 transition-colors hover:text-paper">
            Apps
          </a>
          <a href="#other-work" className="px-2 py-3 transition-colors hover:text-paper">
            Other Work
          </a>
        </div>
        {wallpaper?.downloads && <GlassPillCTA downloads={wallpaper.downloads} />}
      </nav>
    </header>
  );
}
