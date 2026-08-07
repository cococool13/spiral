"use client";

import { useEffect, useRef, useState } from "react";
import { apps } from "@/lib/apps";
import { useOS } from "@/lib/useOS";

const TAP = "cococool13/spiral";

/**
 * The hero's one control: pick an app, get the file. It stays a single pill
 * until it is opened, so the hero reads the same as it did without it.
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
  const os = useOS();

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

  async function copy(cask: string) {
    try {
      await navigator.clipboard.writeText(`brew install --cask ${TAP}/${cask}`);
      setCopied(cask);
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
        className="glass-pill"
      >
        Get an app
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Download a Spiral app"
          className="absolute left-1/2 top-full z-20 mt-3 w-[min(22rem,calc(100vw-3rem))] -translate-x-1/2 rounded-[2px] border border-white/15 bg-black/95 p-2 text-left shadow-2xl backdrop-blur"
        >
          {downloadable.map((app) => {
            const mac = os !== "windows";
            const file = mac ? app.downloads?.mac : app.downloads?.windows;
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
                    href={file?.url}
                    className="min-h-11 rounded-[2px] border border-white/15 px-3 py-3 font-mono text-xs text-paper transition-colors hover:border-red hover:text-red"
                  >
                    {file?.label}
                  </a>
                  {mac && app.brewCask && (
                    <button
                      type="button"
                      onClick={() => copy(app.brewCask as string)}
                      className="min-h-11 px-2 py-3 font-mono text-xs text-gray transition-colors hover:text-paper"
                    >
                      {copied === app.brewCask ? "Copied" : "Copy brew command"}
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
