"use client";

import type { SpiralApp } from "@/lib/apps";
import { useOS } from "@/lib/useOS";

interface Props {
  downloads: NonNullable<SpiralApp["downloads"]>;
  /** No Windows installer exists. Never show a download verb for it. */
  noWindowsBinary?: boolean;
  secondary?: boolean;
}

/** Apple mark. Nominative use on a download control — no endorsement implied. */
function AppleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      // the mark's optical centre sits low; nudge it onto the text baseline
      style={{ position: "relative", top: "-1px" }}
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Windows mark. Solid panes read heavier than the Apple glyph, so it runs smaller. */
function WindowsMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699m10.949-8.099H24V24l-12.9-1.801" />
    </svg>
  );
}

/**
 * The one glassmorphism moment on the site. Auto-detects the visitor's OS
 * and routes to the matching release asset; other platforms get the
 * releases page.
 *
 * On a detected platform the OS name is replaced by its mark ("Download for"
 * + glyph). The full label stays on aria-label, so assistive tech still hears
 * "Download for Mac" — the glyph is decoration, never the only signal.
 */
export default function GlassPillCTA({ downloads, noWindowsBinary, secondary }: Props) {
  const os = useOS();
  // With no Windows installer to offer, the pill points at the repository and
  // says so, rather than dressing a source link up as a download. The Windows
  // mark is dropped too: a download glyph on a "build it" link is a lie a
  // person only discovers after clicking.
  const offMac = noWindowsBinary === true && os !== "mac";
  const target = offMac
    ? downloads.windows
    : os === "mac"
      ? downloads.mac
      : os === "windows"
        ? downloads.windows
        : { url: downloads.all, label: "Download" };

  const Mark = offMac
    ? null
    : os === "mac"
      ? AppleMark
      : os === "windows"
        ? WindowsMark
        : null;

  return (
    <a
      href={target.url}
      aria-label={target.label}
      className={`glass-pill${secondary ? " glass-pill--secondary" : ""}`}
    >
      {Mark ? "Download for" : target.label}
      {Mark && <Mark />}
    </a>
  );
}

export function DisabledPill({ label = "Coming soon" }: { label?: string }) {
  return (
    <span className="glass-pill glass-pill--disabled" aria-disabled="true">
      {label}
    </span>
  );
}
