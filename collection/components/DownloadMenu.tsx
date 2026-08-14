"use client";

import { useEffect, useRef, useState } from "react";
import { apps } from "@/lib/apps";
import { brewCommandFor, offerFor } from "@/lib/downloadOffer";
import { useOS } from "@/lib/useOS";

/**
 * The hero's one control: pick an app, get the file. Closed it is a single
 * block — words on paper, action on red — so the hero reads the same as it
 * did without it.
 *
 * Every row offers the download the visitor's own machine can actually run.
 * On a Mac each row also offers the one-line Homebrew install, because that is
 * the shortest honest path for anyone who already has brew — but it is never
 * the primary action, since most visitors do not.
 */
export default function DownloadMenu() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const os = useOS();

  // On a short window the panel opens below the fold even once the hero stops
  // clipping it. Bring it into view rather than leaving the reader to discover
  // that the thing they just opened is off-screen.
  useEffect(() => {
    if (!open) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [open]);

  const downloadable = apps.filter((a) => a.downloads);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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

  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked (no permission, or a non-secure origin). The command
      // is on screen either way, so say nothing rather than throw a dialog.
    }
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn-block"
      >
        <span className="btn-block__label">Get an app</span>
        <span className="btn-block__chip">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            style={{
              transform: open ? "rotate(180deg)" : undefined,
              transition: "transform var(--spiral-dur-fast) var(--spiral-ease)",
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          ref={panel}
          // No role. This was `role="dialog"`, which promises focus management
          // it does not have; a plain disclosure — a button carrying
          // `aria-expanded` followed by the content it reveals — is the honest
          // pattern and needs no role at all.
          className="absolute left-0 top-full z-20 mt-3 max-h-[min(26rem,70svh)] w-[min(22rem,calc(100vw-3rem))] overflow-y-auto border border-white/15 bg-black/95 p-2 text-left shadow-2xl backdrop-blur"
        >
          {downloadable.map((app) => {
            // `offerFor`, not a local `os !== "windows"`. That test treated
            // Linux as mac and never read `noWindowsBinary`, so a Linux
            // visitor was offered a universal.dmg labelled "Download for Mac".
            const offer = offerFor(app, os);
            const brew = brewCommandFor(app, os);
            if (!offer) return null;
            return (
              <div key={app.slug} className="border-b border-white/10 p-3 last:border-0">
                {/* A label, not a second link to the same file: a 20px-tall
                    duplicate target next to the real button helps nobody. */}
                <p className="type-heading text-sm text-paper">{app.name}</p>
                <p className="mt-1 font-mono text-xs leading-relaxed text-gray">
                  {app.tagline}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={offer.url}
                    className="min-h-11 border border-white/15 px-3 py-3 font-mono text-xs text-paper transition-colors hover:border-red hover:text-red"
                  >
                    {offer.label}
                  </a>
                  {brew && (
                    <button
                      type="button"
                      onClick={() => copy(brew)}
                      className="min-h-11 px-2 py-3 font-mono text-xs text-gray transition-colors hover:text-paper"
                    >
                      {copied === brew ? "Copied" : "Copy brew command"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="px-3 pb-2 pt-1 font-mono text-[11px] leading-relaxed text-gray">
            Free, and free of accounts. Windows builds are not code-signed yet, so Windows
            warns on first run.
          </p>
        </div>
      )}
    </div>
  );
}
