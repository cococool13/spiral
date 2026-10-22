// Builds the two files a release needs beside its bundles: `latest.json` for
// the updater, and `SHA256SUMS.txt` for anyone verifying a download.
//
// Every field here is load-bearing for people already running the app: the
// updater fetches latest.json from releases/latest and verifies each bundle
// against the pubkey baked into tauri.conf.json. A manifest missing a
// signature, or pointing at a file that is not attached to the release, turns
// every existing install's update check into a failure. So this refuses to
// emit a partial manifest — it throws instead, and the release never happens.
//
//   node scripts/make-release-manifest.mjs \
//     --dir ./artifacts --version 1.0.2 --repo cococool13/spiral \
//     --notes "What changed" --date 2026-07-29T12:00:00Z
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function arg(name, required = true) {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : process.argv[i + 1];
  if (required && (value === undefined || value.startsWith("--"))) {
    throw new Error(`missing --${name}`);
  }
  return value;
}

const dir = arg("dir");
const version = arg("version");
const repo = arg("repo");
const notes = arg("notes", false) ?? "";
// Passed in rather than generated, so re-running produces an identical file.
const pubDate = arg("date", false) ?? new Date().toISOString().replace(/\.\d+Z$/, "Z");

const files = readdirSync(dir);
const find = (pattern, what) => {
  const matches = files.filter((f) => pattern.test(f));
  if (matches.length === 0) throw new Error(`no ${what} in ${dir} (looked for ${pattern})`);
  if (matches.length > 1) throw new Error(`ambiguous ${what}: ${matches.join(", ")}`);
  return matches[0];
};

// The updater bundles, and the detached signature each one must ship with.
//
// The macOS pattern carries no version and no target: Tauri names that bundle
// after the .app it wraps, so a universal 1.0.2 build emits "Spiral
// Wallpaper.app.tar.gz", not "Spiral Wallpaper_1.0.2_universal.app.tar.gz".
// Matching the latter cost a tagged release that had already signed and
// notarized successfully. Windows is the opposite — its installer name does
// carry both — which is why only one of the two patterns looks stripped down.
const macBundle = find(/\.app\.tar\.gz$/, "macOS updater bundle");
const winBundle = find(/_x64-setup\.exe$/, "Windows updater bundle");

const signatureFor = (bundle) => {
  const sig = `${bundle}.sig`;
  if (!files.includes(sig)) {
    throw new Error(
      `${bundle} has no ${sig}. The build ran without TAURI_SIGNING_PRIVATE_KEY, ` +
        "so the updater could not verify this release. Refusing to write a manifest.",
    );
  }
  const value = readFileSync(join(dir, sig), "utf8").trim();
  if (value === "") throw new Error(`${sig} is empty`);
  return value;
};

// GitHub rewrites spaces to dots when it stores an asset, so "Spiral
// Wallpaper_1.0.2.dmg" is downloaded as "Spiral.Wallpaper_1.0.2.dmg". Both the
// updater URLs and the checksum lines have to use the name people actually
// end up with, or the URL 404s and `shasum -c` reports every file missing.
const assetName = (file) => file.replaceAll(" ", ".");
const url = (file) => `https://github.com/${repo}/releases/download/v${version}/${assetName(file)}`;

const mac = { signature: signatureFor(macBundle), url: url(macBundle) };
const win = { signature: signatureFor(winBundle), url: url(winBundle) };

// darwin-aarch64 and darwin-x86_64 both point at the universal bundle: older
// clients ask for their arch by name and would otherwise find nothing.
const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    "darwin-universal": mac,
    "darwin-aarch64": mac,
    "darwin-x86_64": mac,
    "windows-x86_64": win,
  },
};

writeFileSync(join(dir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// Checksums cover everything a person can download, including the manifest's
// siblings — but not the manifest itself, which is written after.
const sums = files
  .filter((f) => !f.endsWith(".sig") && f !== "latest.json" && f !== "SHA256SUMS.txt")
  .sort()
  .map(
    (f) =>
      `${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${assetName(basename(f))}`,
  )
  .join("\n");

if (sums === "") throw new Error(`no releasable files found in ${dir}`);
writeFileSync(join(dir, "SHA256SUMS.txt"), `${sums}\n`);

process.stdout.write(
  `manifest: v${version} — macOS ${macBundle}, Windows ${winBundle}\n` +
    `checksums: ${sums.split("\n").length} files\n`,
);
