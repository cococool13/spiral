// Per-surface allowlists for brand sync and hex checks.
// Surfaces call: node scripts/sync-brand.mjs <surface>
//                 node scripts/check-hex.mjs <surface>
export const INSTRUMENT_FONTS = [
  "instrument-serif-400.woff2",
  "instrument-serif-400-italic.woff2",
  "instrument-sans-400.woff2",
  "instrument-sans-500.woff2",
  "instrument-sans-600.woff2",
];

const APP_MARKS = [
  { from: "logo/mark-red.svg", to: "mark-red.svg", dest: "src/assets/brand", mode: "flat" },
  { from: "logo/lockup-red.svg", to: "lockup-red.svg", dest: "src/assets/brand", mode: "flat" },
];

const APP_TOKENS_FONTS = [
  { from: "tokens.css", to: "src/styles/tokens.css", mode: "file" },
  ...INSTRUMENT_FONTS.map((name) => ({
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
      { from: "fonts", to: "fonts", mode: "tree" },
      { from: "logo/mark.svg", to: "logo/mark.svg", mode: "tree" },
      { from: "logo/mark-compact.svg", to: "logo/mark-compact.svg", mode: "tree" },
      { from: "logo/stroke.svg", to: "logo/stroke.svg", mode: "tree" },
    ],
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
