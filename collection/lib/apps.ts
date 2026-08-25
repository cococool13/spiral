/**
 * `source` is shipped and usable, but distributed as source rather than as a
 * download — no status here may offer a binary that does not exist.
 *
 * Spiral Slim is the case that shaped it. Its SECURITY.md draws the line by
 * platform, not by product: the policy scripts are source-only everywhere, and
 * the only official binary is the signed, notarized macOS DMG of the wizard in
 * `apps/slim/desktop`. So the Slim card offers that DMG on macOS and sends
 * Windows visitors to the source, which is what `noWindowsBinary` is for.
 */
export type AppStatus = "live" | "source" | "coming-soon";

export interface SpiralApp {
  slug: string;
  name: string;
  tagline: string;
  status: AppStatus;
  version?: string;
  /** Where a `source` app is built from. Required when status is "source". */
  source?: { url: string; note: string };
  /**
   * The app runs on Windows, but no Windows *binary* is published and none
   * ever will be — the project's SECURITY.md rules it out. Without this the
   * card offers a Windows visitor a download that does not exist, which is
   * the one thing a page about trusting binaries must not do.
   */
  noWindowsBinary?: true;
  /** Inline SVG path data drawn in a 24x24 viewBox, stroke-based. */
  iconPath: string;
  /** A page on this site that explains the app. Rendered as the card's link. */
  page?: string;
  /**
   * Homebrew cask token, for the apps in the cococool13/spiral tap. Present
   * only where a signed macOS build exists — a brew command for an app with no
   * cask would fail in the terminal after the person had already copied it.
   */
  brewCask?: string;
  downloads?: {
    mac: { url: string; label: string };
    windows: { url: string; label: string };
    all: string;
  };
}

const RELEASE = "https://github.com/cococool13/spiral/releases/download/v1.0.3";
const SLIM_RELEASE = "https://github.com/cococool13/Spiral-Slim/releases/download/v1.0.0";
const RESUME_RELEASE =
  "https://github.com/cococool13/spiral/releases/download/resume-v0.1.1";

export const apps: SpiralApp[] = [
  {
    slug: "wallpaper",
    name: "Spiral Wallpaper",
    tagline: "Click a wallpaper. It downloads and applies. That's it.",
    status: "live",
    version: "1.0.3",
    brewCask: "spiral-wallpaper",
    page: "/wallpaper/",
    iconPath: "M3 5h18v13H3zM3 18h18M9 21h6M6 8l4 4M14 8l4 4M10 12l-2 3M16 12l-1.5 3",
    downloads: {
      mac: {
        url: `${RELEASE}/Spiral.Wallpaper_1.0.3_universal.dmg`,
        label: "Download for Mac",
      },
      windows: {
        url: `${RELEASE}/Spiral.Wallpaper_1.0.3_x64-setup.exe`,
        label: "Download for Windows",
      },
      all: "https://github.com/cococool13/spiral/releases/latest",
    },
  },
  {
    slug: "slim",
    name: "Spiral Slim",
    tagline: "Brave wizard on Mac. Scripts for Brave, Chrome, Edge, and Firefox.",
    status: "live",
    version: "1.0.0",
    brewCask: "spiral-slim",
    noWindowsBinary: true,
    downloads: {
      mac: {
        url: `${SLIM_RELEASE}/Spiral.Slim_1.0.0_universal.dmg`,
        label: "Download for Mac",
      },
      // No Windows binary is published — SECURITY.md. Source link only.
      windows: {
        url: "https://github.com/cococool13/spiral/tree/main/apps/slim",
        label: "Read the source",
      },
      all: "https://github.com/cococool13/Spiral-Slim/releases/latest",
    },
    // A shield with two setting lines: policy, under protection.
    page: "/slim/",
    iconPath: "M12 3l7 3v5.5c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5V6zM9 11h6M9 14h4",
  },
  {
    // "Spiral Clean", never "Spiral Cleaner" — apps/clean/CONTEXT.md names the
    // latter as the term to avoid, and this file is what the live site renders.
    // The slug moves with it, so the eventual /apps/clean route matches the
    // directory and the tag namespace (`clean-v*`) rather than contradicting both.
    slug: "clean",
    name: "Spiral Clean",
    // Four screens now, not one. The old tagline ("Deletes caches. Nothing
    // else.") described the app before Uninstall, Optimize and Storage
    // existed, and undersold the thing it is actually built around.
    tagline:
      "Cleans, uninstalls, and shows what is using your disk. Proves what it won't touch.",
    // Feature-complete, and deliberately still not "live" or "source": no
    // release exists, and nobody has yet opened the app. Inviting people to
    // build and run it would be offering something this project has not
    // itself looked at.
    status: "coming-soon",
    page: "/clean/",
    iconPath: "M12 3v6M8 9h8l1 12H7zM9 13v4M12 13v4M15 13v4",
  },
  {
    slug: "resume",
    name: "Spiral Resume",
    tagline: "Twelve typeset layouts. Digits and names are not allowed to move.",
    status: "live",
    version: "0.1.1",
    brewCask: "spiral-resume",
    page: "/resume/",
    iconPath: "M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 13h6M9 16h4",
    downloads: {
      mac: {
        url: `${RESUME_RELEASE}/Spiral.Resume_0.1.1_universal.dmg`,
        label: "Download for Mac",
      },
      windows: {
        url: `${RESUME_RELEASE}/Spiral.Resume_0.1.1_x64-setup.exe`,
        label: "Download for Windows",
      },
      all: "https://github.com/cococool13/spiral/releases/tag/resume-v0.1.1",
    },
  },
];
