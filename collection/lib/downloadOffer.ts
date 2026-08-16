import type { SpiralApp } from "./apps";
import type { OS } from "./useOS";

/** What a visitor on a given machine is actually offered for one app. */
export interface Offer {
  url: string;
  /** The full sentence, and the accessible name. Always names the platform. */
  label: string;
  /** Which platform mark the control may draw, if any. */
  mark: "apple" | "windows" | null;
  /** True when this leads to source to build, not to an installer. */
  source: boolean;
}

/**
 * The one place that decides what a visitor is offered.
 *
 * There used to be two. `GlassPillCTA` honoured `noWindowsBinary` and sent
 * anything that was not mac or Windows to the releases page; `DownloadMenu`
 * asked only `os !== "windows"` and never read `noWindowsBinary` at all, so a
 * Linux visitor was handed a `universal.dmg` labelled "Download for Mac" and a
 * Homebrew command to go with it. Two policies over one dataset, and the data
 * was right both times.
 *
 * Pure, and total: every app-and-OS pair has an answer. `apps.ts` types the
 * honesty in; this reads it out, so no caller has to remember `noWindowsBinary`
 * exists.
 */
export function offerFor(app: SpiralApp, os: OS): Offer | null {
  if (!app.downloads) return null;

  if (os === "mac") {
    return {
      url: app.downloads.mac.url,
      label: app.downloads.mac.label,
      mark: "apple",
      source: false,
    };
  }

  // The app runs on Windows but no installer is published and none will be.
  // Offering a download verb here is the one thing a page about trusting
  // binaries must not do: it is a link to source, and it says so.
  if (app.noWindowsBinary) {
    return {
      url: app.downloads.windows.url,
      label: "Read the source",
      mark: null,
      source: true,
    };
  }

  if (os === "windows") {
    return {
      url: app.downloads.windows.url,
      label: app.downloads.windows.label,
      mark: "windows",
      source: false,
    };
  }

  // Neither mac nor Windows: no assumption about what this machine can run.
  return { url: app.downloads.all, label: "All downloads", mark: null, source: false };
}

/** Homebrew is a macOS path. It is never the primary action, and never shown
 *  to a visitor who cannot run it. */
export function brewCommandFor(app: SpiralApp, os: OS): string | null {
  if (os !== "mac" || !app.brewCask) return null;
  return `brew install --cask cococool13/spiral/${app.brewCask}`;
}
