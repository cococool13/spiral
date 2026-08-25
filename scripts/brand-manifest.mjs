// Per-surface allowlists for brand sync and hex checks.
// Surfaces call: node scripts/sync-brand.mjs <surface>
//                 node scripts/check-hex.mjs <surface>
export const BRAND_FONTS = [
  "host-grotesk-400.woff2",
  "host-grotesk-400-italic.woff2",
  "host-grotesk-500.woff2",
  "host-grotesk-600.woff2",
];

const APP_MARKS = [
  { from: "logo/mark-red.svg", to: "mark-red.svg", dest: "src/assets/brand", mode: "flat" },
  { from: "logo/lockup-red.svg", to: "lockup-red.svg", dest: "src/assets/brand", mode: "flat" },
];

const APP_TOKENS_FONTS = [
  { from: "tokens.css", to: "src/styles/tokens.css", mode: "file" },
  ...BRAND_FONTS.map((name) => ({
    from: `fonts/${name}`,
    to: `src/assets/fonts/${name}`,
    mode: "file",
  })),
];

/** @type {Record<string, object>} */
export const SURFACES = {
  collection: {
    root: "collection",
    softFailStandalone: false,
    destRoot: "public/brand",
    wipeDirs: ["public/brand"],
    entries: [
      { from: "tokens.css", to: "tokens.css", mode: "tree" },
      { from: "tokens.json", to: "tokens.json", mode: "tree" },
      { from: "tokens.json", to: "lib/brand-tokens.json", mode: "file" },
      { from: "fonts", to: "fonts", mode: "tree" },
      { from: "logo/mark.svg", to: "logo/mark.svg", mode: "tree" },
      { from: "logo/mark-compact.svg", to: "logo/mark-compact.svg", mode: "tree" },
      { from: "logo/mark-red.svg", to: "logo/mark-red.svg", mode: "tree" },
      { from: "hero/hero-exit.webp", to: "hero/hero-exit.webp", mode: "tree" },
    ],
    hex: {
      scan: ["app", "components", "lib"],
      allow: ["lib/brand-tokens.json"],
    },
  },

  wallpaper: {
    root: "apps/wallpaper",
    softFailStandalone: false,
    wipeDirs: ["src/assets/brand", "src/assets/fonts"],
    entries: [...APP_MARKS, ...APP_TOKENS_FONTS],
    hex: {
      scan: ["src", "index.html"],
      allow: ["src/styles/tokens.css"],
    },
  },

  clean: {
    root: "apps/clean",
    softFailStandalone: false,
    wipeDirs: ["src/assets/brand", "src/assets/fonts"],
    entries: [...APP_MARKS, ...APP_TOKENS_FONTS],
    hex: {
      scan: ["src", "index.html"],
      allow: ["src/styles/tokens.css"],
    },
  },

  resume: {
    root: "apps/Resume",
    softFailStandalone: false,
    wipeDirs: ["src/assets/brand", "src/assets/fonts"],
    entries: [
      ...APP_MARKS,
      {
        from: "logo/mark-compact-red.svg",
        to: "mark-compact-red.svg",
        dest: "src/assets/brand",
        mode: "flat",
      },
      ...APP_TOKENS_FONTS,
    ],
    hex: {
      scan: ["src", "index.html"],
      allow: ["src/styles/tokens.css"],
    },
  },

  slim: {
    root: "apps/slim/desktop",
    softFailStandalone: true,
    standaloneProbe: ["src/assets/brand/mark-red.svg", "src/assets/brand/lockup-red.svg"],
    wipeDirs: ["src/assets/brand", "src/assets/fonts"],
    entries: [...APP_MARKS, ...APP_TOKENS_FONTS],
    hex: {
      scan: ["src", "index.html", "tests"],
      allow: ["src/styles/tokens.css"],
      skipMissingScanRoots: true,
    },
  },
};
