// One live app. Retired ids stay so an old tag can be named
// without reading a directory this repo no longer has.

/** @type {Record<string, object>} */
export const APPS = {
  spiral: {
    name: "Spiral",
    builds: "macOS only (Windows held at 1.0.4)",
    workflow: "build.yml",
    tag: (v) => `v${v}`,
    dir: "apps/spiral",
    crate: "spiral-wallpaper",
    site: {
      slug: "spiral",
      live: true,
      releaseConst: "RELEASE",
      owner: "cococool13",
      repo: "spiral",
      downloadTag: (v) => `v${v}`,
      assets: {
        mac: (v) => `Spiral_${v}_universal.dmg`,
        windows: (v) => `Spiral_${v}_x64-setup.exe`,
      },
      // Windows stays on Wallpaper 1.0.4 until the installer hook rehearsal
      // passes on a real PC (release-app.yml refuses Windows without it).
      // While this is set, a bump leaves the site's Windows link on this
      // build. Remove it, and set `windows: true` in build.yml, to ship both.
      windowsHeld: {
        tag: "v1.0.4",
        asset: "Spiral.Wallpaper_1.0.4_x64-setup.exe",
      },
      all: "latest",
    },
  },
};

/** Apps this repo no longer releases. `release.mjs` refuses these ids. */
export const RETIRED = {
  wallpaper: {},
  resume: {},
  clean: {},
  slim: {},
};

/** Longest prefix first. Bare `v` is last. */
export const TAG_PREFIXES = [
  { prefix: "slim-v", app: "slim" },
  { prefix: "clean-v", app: "clean" },
  { prefix: "resume-v", app: "resume" },
  { prefix: "v", app: "spiral" },
];

const SEMVER = /^\d+\.\d+\.\d+$/;

/** `clean-v0.1.0` -> `{ app: "clean", version: "0.1.0" }`, or null. */
export function parseTag(tag) {
  for (const { prefix, app } of TAG_PREFIXES) {
    if (tag.startsWith(prefix)) {
      const version = tag.slice(prefix.length);
      return SEMVER.test(version) ? { app, version } : null;
    }
  }
  return null;
}

/**
 * Wallpaper shipped on bare `v` tags through 1.x. Spiral starts at 2.0.0.
 * A 1.x tag is retired and is not compared with the live files.
 */
export function isRetiredTag(parsed) {
  if (!parsed) return false;
  if (parsed.app !== "spiral") return Boolean(RETIRED[parsed.app]);
  const major = Number(parsed.version.split(".")[0]);
  return major < 2;
}

export function sameFamily(tag) {
  if (tag.startsWith("resume-v")) return (other) => other.startsWith("resume-v");
  if (tag.startsWith("slim-v")) return (other) => other.startsWith("slim-v");
  if (tag.startsWith("clean-v")) return (other) => other.startsWith("clean-v");
  return (other) => /^v\d/.test(other);
}
