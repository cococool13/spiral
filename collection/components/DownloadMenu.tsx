"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apps } from "@/lib/apps";
import { brewCommandFor, offerFor } from "@/lib/downloadOffer";
import { useOS } from "@/lib/useOS";
import { AppleMark, WindowsMark } from "./GlassPillCTA";

interface Props {
  /** Hero is the page's one first-screen download. Nav is the same list, compact. */
  variant?: "hero" | "nav";
}

/**
 * Closed: one control for this machine. Open: every published binary it can run.
 * Names only — no taglines in the list.
 */
export default function DownloadMenu({ variant = "nav" }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { os, ready } = useOS();
  const panelId = useId();
  const hero = variant === "hero";

  const downloadable = apps.filter((a) => a.downloads);
  const wallpaper = apps.find((a) => a.slug === "wallpaper");
  const closedOffer = ready && wallpaper ? offerFor(wallpaper, os) : null;

  useEffect(() => {
    if (!open || !hero) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [open, hero]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const Mark =
    closedOffer?.mark === "apple"
      ? AppleMark
      : closedOffer?.mark === "windows"
        ? WindowsMark
        : null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        ref={button}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Download — choose an app"
        onClick={() => setOpen((v) => !v)}
        className={hero ? "glass-pill" : "glass-pill glass-pill--nav"}
      >
        {Mark ? "Download for" : "Download"}
        {Mark ? <Mark /> : null}
      </button>

      <div
        id={panelId}
        ref={panel}
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={[
          "download-panel absolute z-20 w-[min(16rem,calc(100vw-2rem))] overflow-hidden border border-paper/15 bg-black/95 text-left shadow-2xl backdrop-blur",
          hero
            ? "bottom-full left-1/2 mb-3 -translate-x-1/2"
            : "top-full left-1/2 mt-2 -translate-x-1/2",
          open ? "download-panel--open" : "",
        ].join(" ")}
      >
        <ul>
          {downloadable.map((app) => {
            const offer = ready
              ? offerFor(app, os)
              : app.downloads
                ? {
                    url: app.downloads.all,
                    label: "Download",
                    mark: null,
                    source: false,
                  }
                : null;
            if (!offer) return null;
            const brew = ready ? brewCommandFor(app, os) : null;
            return (
              <li key={app.slug} className="border-b border-paper/10 last:border-0">
                <a
                  href={offer.url}
                  className="flex min-h-11 items-center px-4 text-sm text-paper transition-colors hover:bg-paper/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red"
                >
                  {offer.source
                    ? `${app.name.replace("Spiral ", "")} — ${offer.label}`
                    : app.name.replace("Spiral ", "")}
                </a>
                {brew ? (
                  <p className="px-4 pb-3 font-mono text-xs leading-relaxed text-gray">
                    {brew}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {os === "windows" &&
        downloadable.some((a) => a.downloads && !a.noWindowsBinary) ? (
          <p className="px-4 py-3 text-sm leading-relaxed text-paper">
            Wallpaper and Resume Windows builds are not code-signed yet. Windows warns on
            first run. Slim has no Windows installer — use the source link.
          </p>
        ) : null}
      </div>
    </div>
  );
}
