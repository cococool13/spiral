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
  downloads?: {
    mac: { url: string; label: string };
    windows: { url: string; label: string };
    all: string;
  };
}

const RELEASE = "https://github.com/cococool13/spiral/releases/download/v1.0.3";
const SLIM_RELEASE = "https://github.com/cococool13/Spiral-Slim/releases/download/v1.0.0";

export const apps: SpiralApp[] = [
  {
    slug: "wallpaper",
    name: "Spiral Wallpaper",
    tagline: "Click a wallpaper. It downloads and applies. That's it.",
    status: "live",
    version: "1.0.3",
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
    tagline: "Sets Brave's privacy policies. Shows every change first.",
    status: "live",
    version: "1.0.0",
    noWindowsBinary: true,
    downloads: {
      mac: {
        url: `${SLIM_RELEASE}/Spiral.Slim_1.0.0_universal.dmg`,
        label: "Download for Mac",
      },
      // Windows runs the same app, built from source. This points at the
      // repository rather than at a binary that does not and will not exist.
      windows: {
        url: "https://github.com/cococool13/spiral/tree/main/apps/slim",
        label: "Build it for Windows",
      },
      all: "https://github.com/cococool13/Spiral-Slim/releases/latest",
    },
    // A shield with two setting lines: policy, under protection.
    iconPath: "M12 3l7 3v5.5c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5V6zM9 11h6M9 14h4",
  },
  {
    slug: "dashboard",
    name: "Spiral Dashboard",
    tagline: "One screen for your day.",
    status: "coming-soon",
    iconPath: "M3 4h18v16H3zM3 10h8M11 4v16M11 14h10",
  },
  {
    // "Spiral Clean", never "Spiral Cleaner" — apps/clean/CONTEXT.md names the
    // latter as the term to avoid, and this file is what the live site renders.
    // The slug moves with it, so the eventual /apps/clean route matches the
    // directory and the tag namespace (`clean-v*`) rather than contradicting both.
    slug: "clean",
    name: "Spiral Clean",
    tagline: "Removes caches and uninstalls apps.",
    status: "coming-soon",
    iconPath: "M12 3v6M8 9h8l1 12H7zM9 13v4M12 13v4M15 13v4",
  },
  {
    slug: "resume",
    name: "Spiral Resume",
    tagline: "Writes a resume to a PDF.",
    status: "coming-soon",
    iconPath: "M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 13h6M9 16h4",
  },
  {
    slug: "weather",
    name: "Spiral Weather",
    tagline: "The forecast where you are.",
    status: "coming-soon",
    iconPath: "M7 15a4 4 0 1 1 .5-7.97A5 5 0 1 1 17 15zM8 19h.01M12 19h.01M16 19h.01",
  },
  {
    slug: "transcribe",
    name: "Spiral Transcribe",
    tagline: "Turns audio into text on your machine.",
    status: "coming-soon",
    iconPath:
      "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  },
  {
    slug: "chat",
    name: "Spiral Chat",
    tagline: "Runs language models on your machine.",
    status: "coming-soon",
    iconPath: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  },
];
