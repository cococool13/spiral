export type AppStatus = "live" | "coming-soon";

export interface SpiralApp {
  slug: string;
  name: string;
  tagline: string;
  status: AppStatus;
  version?: string;
  /** Inline SVG path data drawn in a 24x24 viewBox, stroke-based. */
  iconPath: string;
  video?: {
    mp4: string;
    webm: string;
    poster: string;
  };
  downloads?: {
    mac: { url: string; label: string };
    windows: { url: string; label: string };
    all: string;
  };
}

const RELEASE =
  "https://github.com/cococool13/spiral-wallpaper/releases/download/v1.0.1";

export const apps: SpiralApp[] = [
  {
    slug: "wallpaper",
    name: "Spiral Wallpaper",
    tagline: "Click a wallpaper. It downloads and applies. That's it.",
    status: "live",
    version: "1.0.1",
    iconPath:
      "M3 5h18v13H3zM3 18h18M9 21h6M6 8l4 4M14 8l4 4M10 12l-2 3M16 12l-1.5 3",
    video: {
      mp4: "/brand/media/wallpaper-demo.mp4",
      webm: "/brand/media/wallpaper-demo.webm",
      poster: "/brand/media/wallpaper-demo-poster.avif",
    },
    downloads: {
      mac: {
        url: `${RELEASE}/Spiral.Wallpaper_1.0.1_universal.dmg`,
        label: "Download for Mac",
      },
      windows: {
        url: `${RELEASE}/Spiral.Wallpaper_1.0.1_x64-setup.exe`,
        label: "Download for Windows",
      },
      all: "https://github.com/cococool13/spiral-wallpaper/releases/latest",
    },
  },
  {
    slug: "dashboard",
    name: "Spiral Dashboard",
    tagline: "Your day on one quiet screen.",
    status: "coming-soon",
    iconPath: "M3 4h18v16H3zM3 10h8M11 4v16M11 14h10",
  },
  {
    slug: "cleaner",
    name: "Spiral Cleaner",
    tagline: "Deletes caches. Nothing else.",
    status: "coming-soon",
    iconPath: "M12 3v6M8 9h8l1 12H7zM9 13v4M12 13v4M15 13v4",
  },
  {
    slug: "resume",
    name: "Spiral Resume",
    tagline: "A resume builder that stays out of the way.",
    status: "coming-soon",
    iconPath: "M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 13h6M9 16h4",
  },
  {
    slug: "weather",
    name: "Spiral Weather",
    tagline: "The forecast, without the feed.",
    status: "coming-soon",
    iconPath: "M7 15a4 4 0 1 1 .5-7.97A5 5 0 1 1 17 15zM8 19h.01M12 19h.01M16 19h.01",
  },
  {
    slug: "transcribe",
    name: "Spiral Transcribe",
    tagline: "Audio in, text out. On your machine.",
    status: "coming-soon",
    iconPath: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  },
  {
    slug: "chat",
    name: "Spiral Chat",
    tagline: "Local models, plain interface.",
    status: "coming-soon",
    iconPath: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  },
];
