"use client";

import type { SpiralApp } from "@/lib/apps";
import { useOS } from "@/lib/useOS";

interface Props {
  downloads: NonNullable<SpiralApp["downloads"]>;
  /** No Windows installer exists; do not describe installing one. */
  noWindowsBinary?: boolean;
}

const installSteps = {
  mac: "Mac: open the signed, notarized DMG, then drag Spiral to Applications.",
  windows:
    "Windows: open the setup file. SmartScreen may ask you to choose More info before Run anyway.",
  other: "Choose a macOS or Windows download from the release page.",
};

/**
 * `useOS` returns "other" until it mounts, so the `other` line is what every
 * visitor reads first and what a no-JS visitor reads permanently. It has to
 * be true on any platform — naming Linux here would tell a Windows user the
 * wrong thing for the first frame, and forever if scripts are blocked.
 */
const sourceSteps = {
  windows:
    "Windows: the app runs here too, but there is no installer to download — " +
    "you build it from source. It has not been run on Windows yet, so treat " +
    "it as new.",
  other:
    "Runs on macOS and Windows. macOS has a signed download; Windows builds " +
    "from source. On Linux, the same repository has a command-line version.",
};

/** Answers the install questions a visitor has after choosing a download. */
export default function DownloadConfidence({ downloads, noWindowsBinary }: Props) {
  const os = useOS();
  const step =
    noWindowsBinary === true && os !== "mac"
      ? sourceSteps[os === "windows" ? "windows" : "other"]
      : installSteps[os];

  return (
    <aside className="border-y border-white/10 py-5" aria-label="Download details">
      <p className="type-eyebrow text-paper">What happens next</p>
      <p className="mt-3 text-sm leading-relaxed text-concrete">{step}</p>
      <p className="mt-3 text-sm leading-relaxed text-gray">
        No account. No telemetry. Close the window and Spiral stops running.
      </p>
      <a
        href={downloads.all}
        className="mt-4 inline-flex min-h-11 items-center font-mono text-xs text-paper underline underline-offset-4 transition-colors hover:text-red"
      >
        Checksums and all release files
      </a>
    </aside>
  );
}
