"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apps } from "@/lib/apps";
import { brewCommandFor, offerFor } from "@/lib/downloadOffer";
import { useOS } from "@/lib/useOS";

interface Props {
  /** Hero is the page's primary action. Nav is the same chooser, quieter, on every page. */
  variant?: "hero" | "nav";
}

/**
 * Pick an app, get the file. Closed it is a single control; open it lists
 * every published binary this machine can actually run.
 *
 * Every row offers the download the visitor's own machine can actually run.
 * On a Mac each row also offers the one-line Homebrew install, because that is
 * the shortest honest path for anyone who already has brew — but it is never
 * the primary action, since most visitors do not.
 */
export default function DownloadMenu({ variant = "hero" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const os = useOS();
  const panelId = useId();
  const nav = variant === "nav";

  // On a short window the hero panel opens below the fold even once the stage
  // stops clipping it. Bring it into view rather than leaving the reader to
  // discover that the thing they just opened is off-screen. The nav is already
  // on screen, so it does not need this.
  useEffect(() => {
    if (!open || nav) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [open, nav]);

  const downloadable = apps.filter((a) => a.downloads);

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

  const chevron = (size: number) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
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
  );

  return (
    <div ref={wrap} className="relative">
      {nav ? (
        <button
          type="button"
          ref={button}
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
          className="glass-pill glass-pill--nav"
        >
          Download
          {chevron(14)}
        </button>
      ) : (
        <button
          type="button"
          ref={button}
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
          className="glass-pill"
        >
          Get an app
          {chevron(16)}
        </button>
      )}

      <div
        id={panelId}
        ref={panel}
        // No role. This was `role="dialog"`, which promises focus management
        // it does not have; a plain disclosure — a button carrying
        // `aria-expanded` followed by the content it reveals — is the honest
        // pattern and needs no role at all.
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={[
          "download-panel absolute top-full z-20 max-h-[min(26rem,70svh)] overflow-y-auto border border-white/15 bg-black/95 p-2 text-left shadow-2xl backdrop-blur",
          nav
            ? "download-panel--nav right-0 mt-2 w-[min(22rem,calc(100vw-2rem))]"
            : "left-0 mt-3 w-[min(22rem,calc(100vw-3rem))]",
          open ? "download-panel--open" : "",
        ].join(" ")}
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
                <a href={offer.url} className="glass-pill glass-pill--nav">
                  {offer.label}
                </a>
                {brew && (
                  <button
                    type="button"
                    onClick={() => copy(brew)}
                    className="glass-pill glass-pill--secondary glass-pill--nav"
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
    </div>
  );
}
