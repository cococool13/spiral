// Single registry for release / version / downloads / site catalogue rewrite.
// Tag functions are monorepo git tags. site.downloadTag may differ (Slim).

/** @type {Record<string, object>} */
export const APPS = {
  wallpaper: {
    name: "Spiral Wallpaper",
    builds: "macOS + Windows",
    workflow: "build.yml",
    tag: (v) => `v${v}`,
    dir: "apps/wallpaper",
    crate: "spiral-wallpaper",
    site: {
      slug: "wallpaper",
      live: true,
      releaseConst: "RELEASE",
      owner: "cococool13",
      repo: "spiral",
      downloadTag: (v) => `v${v}`,
      assets: {
        mac: (v) => `Spiral.Wallpaper_${v}_universal.dmg`,
        windows: (v) => `Spiral.Wallpaper_${v}_x64-setup.exe`,
      },
      all: "latest",
      appPages: {
        proofLine: (v) => `Free. Version ${v}, signed and notarised on macOS.`,
        closingBody: (v) => `Free, signed on macOS, and 4.6 MB. Version ${v} is out now.`,
      },
    },
  },
  slim: {
    name: "Spiral Slim",
    builds: "macOS",
    workflow: "release-slim.yml",
    tag: (v) => `slim-v${v}`,
    dir: "apps/slim/desktop",
    crate: "spiral-slim",
    site: {
      slug: "slim",
      live: true,
      releaseConst: "SLIM_RELEASE",
      owner: "cococool13",
      repo: "Spiral-Slim",
      downloadTag: (v) => `v${v}`,
      assets: {
        mac: (v) => `Spiral.Slim_${v}_universal.dmg`,
      },
      all: "latest",
      noWindowsBinary: true,
    },
  },
  clean: {
    name: "Spiral Clean",
    builds: "macOS",
    workflow: "release-clean.yml",
    tag: (v) => `clean-v${v}`,
    dir: "apps/clean",
    crate: "spiral-clean",
    site: {
      slug: "clean",
      live: false,
    },
  },
  resume: {
    name: "Spiral Resume",
    builds: "macOS + Windows",
    workflow: "release-resume.yml",
    tag: (v) => `resume-v${v}`,
    dir: "apps/Resume",
    crate: "spiral-resume",
    site: {
      slug: "resume",
      live: true,
      releaseConst: "RESUME_RELEASE",
      owner: "cococool13",
      repo: "spiral",
      downloadTag: (v) => `resume-v${v}`,
      assets: {
        mac: (v) => `Spiral.Resume_${v}_universal.dmg`,
        windows: (v) => `Spiral.Resume_${v}_x64-setup.exe`,
      },
      all: "tag",
      appPages: {
        ctaLabel: (v) => `Get ${v}`,
        ctaHref: (v) =>
          `https://github.com/cococool13/spiral/releases/tag/resume-v${v}`,
        faqWindows: (v) =>
          `Yes. ${v} includes a Windows installer. It is unsigned, the same as Wallpaper, so SmartScreen will warn the first time.`,
        closingHeadline: (v) => `${v} is the first downloadable release.`,
      },
    },
  },
};

/** Longest prefix first — bare `v` must be last. */
export const TAG_PREFIXES = [
  { prefix: "slim-v", app: "slim" },
  { prefix: "clean-v", app: "clean" },
  { prefix: "resume-v", app: "resume" },
  { prefix: "v", app: "wallpaper" },
];

export function sameFamily(tag) {
  if (tag.startsWith("resume-v")) return (other) => other.startsWith("resume-v");
  if (tag.startsWith("slim-v")) return (other) => other.startsWith("slim-v");
  if (tag.startsWith("clean-v")) return (other) => other.startsWith("clean-v");
  return (other) => /^v\d/.test(other);
}
