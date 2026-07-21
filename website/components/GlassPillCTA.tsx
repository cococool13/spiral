"use client";

import { useOS } from "@/lib/useOS";
import type { SpiralApp } from "@/lib/apps";

interface Props {
  downloads: NonNullable<SpiralApp["downloads"]>;
  secondary?: boolean;
}

/**
 * The one glassmorphism moment on the site. Auto-detects the visitor's OS
 * and routes to the matching release asset; other platforms get the
 * releases page.
 */
export default function GlassPillCTA({ downloads, secondary }: Props) {
  const os = useOS();
  const target =
    os === "mac"
      ? downloads.mac
      : os === "windows"
        ? downloads.windows
        : { url: downloads.all, label: "Download" };

  return (
    <a
      href={target.url}
      className={`glass-pill${secondary ? " glass-pill--secondary" : ""}`}
    >
      {target.label}
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
