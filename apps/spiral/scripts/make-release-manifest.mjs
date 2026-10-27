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
// A macOS-only release (Windows held back) writes no "windows-x86_64" key, so
// an installed Windows build finds no update and stays where it is.
const withWindows = !process.argv.includes("--no-windows");

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
const winBundle = withWindows ? find(/_x64-setup\.exe$/, "Windows updater bundle") : null;

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
const win = winBundle ? { signature: signatureFor(winBundle), url: url(winBundle) } : null;

// macOS gets exactly one key, "darwin-aarch64", pointing at the universal
// bundle. tauri-plugin-updater 2.14.0 (what Wallpaper 1.0.4 ships) builds
// its lookup list in `Updater::get_urls` (src/updater.rs:753-761) as
// "{os}-{arch}-{installer}" then "{os}-{arch}" and returns TargetsNotFound
// when neither exists; its src/ has no "universal" fallback, and neither
// does 2.10.1 (Wallpaper 1.0.1-1.0.3; 1.0.0 has no updater). No release
// calls `UpdaterBuilder::target`, the only way to ask for another key. So an
// arm64 client reads "darwin-aarch64-app" or "darwin-aarch64", nothing else.
// `{arch}` is the compiled slice, so the Intel slice under Rosetta (macOS
// 11+ by definition) also misses; it can take the DMG like any Intel Mac.
//
// There is deliberately no "darwin-x86_64", and no "darwin-universal" a
// later plugin could fall back to, in this manifest or any later one.
// Spiral Wallpaper 1.0.4 runs on macOS 10.13-10.15, and every Mac on those
// versions is Intel. Its updater polls a fixed GitHub URL and sends no OS
// version, so the feed cannot tell a 10.15 Mac from an Intel Mac on 11+.
// Spiral 2.0.0 needs macOS 11 (minimumSystemVersion 11.0); offered to
// x86_64, it would install an app that will not launch on 10.13-10.15.
// Without the key, 1.0.4's startup check gets TargetsNotFound, drops it, and
// those people stay on a working 1.0.4. Intel Macs on 11+ update by
// downloading the DMG, which is still universal. Put an Intel key back only
// if 2.x moves to an update URL that 1.0.x never polls.
const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    "darwin-aarch64": mac,
    ...(win ? { "windows-x86_64": win } : {}),
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
  `manifest: v${version} — macOS ${macBundle}, Windows ${winBundle ?? "held back"}\n` +
    `checksums: ${sums.split("\n").length} files\n`,
);
