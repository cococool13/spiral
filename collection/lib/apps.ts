/**
 * No status here may offer a binary that does not exist.
 * The download is the published Spiral Wallpaper 1.0.4 build.
 * Spiral 2.0.0 is not published, so these URLs stay on that build.
 */
export type AppStatus = "live" | "coming-soon";

export interface SpiralSection {
  id: string;
  name: string;
  summary: string;
  previousRelease?: string;
}

export interface SpiralApp {
  slug: string;
  name: string;
  tagline: string;
  status: AppStatus;
  version?: string;
  noWindowsBinary?: true;
  brewCask?: string;
  downloads?: {
    mac: { url: string; label: string };
    windows: { url: string; label: string };
    all: string;
  };
  sections: SpiralSection[];
}

const RELEASE = "https://github.com/cococool13/spiral/releases/download/v2.0.1";

export const apps: SpiralApp[] = [
  {
    slug: "spiral",
    name: "Spiral",
    tagline: "Wallpaper and Resume. One window.",
    status: "live",
    version: "2.0.1",
    brewCask: "spiral-wallpaper",
    downloads: {
      mac: {
        url: `${RELEASE}/Spiral_2.0.1_universal.dmg`,
        label: "Download for Mac",
      },
      windows: {
        url: "https://github.com/cococool13/spiral/releases/download/v1.0.4/Spiral.Wallpaper_1.0.4_x64-setup.exe",
        label: "Download for Windows (Wallpaper 1.0.4)",
      },
      all: "https://github.com/cococool13/spiral/releases/latest",
    },
    sections: [
      {
        id: "wallpaper",
        name: "Wallpaper",
        summary: "Click a wallpaper. It downloads and applies.",
      },
      {
        id: "resume",
        name: "Resume",
        summary: "Twelve typeset layouts. Digits and names stay put.",
        previousRelease:
          "https://github.com/cococool13/spiral/releases/tag/resume-v0.1.2",
      },
    ],
  },
];
