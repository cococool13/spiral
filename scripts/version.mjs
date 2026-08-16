#!/usr/bin/env node
// One app version lives in four files read by four different tools — npm,
// Tauri's bundler, Cargo, and Cargo's lockfile — and until now nothing
// compared them. They have drifted before: Slim shipped as 1.0.0 while its
// package.json still said 0.1.0, and nobody noticed until a production audit
// read all three side by side.
//
//   node scripts/version.mjs check                 every app
//   node scripts/version.mjs check wallpaper       one app
//   node scripts/version.mjs set wallpaper 1.0.3   write all four
//
// `check` is deliberately dependency-free and never shells out, so CI can run
// it on every push in under a second without a toolchain. `set` asks cargo to
// update the lockfile when cargo is on PATH, because hand-editing a lockfile
// is how you get one that resolves differently from the manifest beside it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Adding an app here is the whole cost of putting it under the same guard.
const APPS = {
  wallpaper: { dir: "apps/wallpaper", crate: "spiral-wallpaper" },
  slim: { dir: "apps/slim/desktop", crate: "spiral-slim" },
  clean: { dir: "apps/clean", crate: "spiral-clean" },
  resume: { dir: "apps/Resume", crate: "spiral-resume" },
};

const SEMVER = /^\d+\.\d+\.\d+$/;

const fail = (message) => {
  process.stderr.write(`version: ${message}\n`);
  process.exit(1);
};

/** The four files an app's version has to agree across, in read order. */
function filesFor(app) {
  const { dir } = APPS[app];
  return {
    "package.json": `${dir}/package.json`,
    "tauri.conf.json": `${dir}/src-tauri/tauri.conf.json`,
    "Cargo.toml": `${dir}/src-tauri/Cargo.toml`,
    "Cargo.lock": `${dir}/src-tauri/Cargo.lock`,
  };
}

const read = (relative) => {
  const path = resolve(ROOT, relative);
  if (!existsSync(path)) fail(`no such file: ${relative}`);
  return readFileSync(path, "utf8");
};

// Cargo.lock holds every dependency's version too, so the crate's own
// [[package]] block has to be located by name rather than by first match.
// Line endings and spacing around `=` are both tolerated: a Windows checkout
// with core.autocrlf gets CRLF in Cargo.lock, and matching bare \n there would
// report the crate as missing from its own lockfile — a confusing way to say
// "you are on Windows". Windows builds this repo in CI, so this is a real path.
function lockEntry(text, crate) {
  const pattern = new RegExp(
    `(\\[\\[package\\]\\]\\r?\\nname\\s*=\\s*"${crate}"\\r?\\nversion\\s*=\\s*")([^"]+)(")`,
  );
  const match = text.match(pattern);
  if (!match) return null;
  return { pattern, version: match[2] };
}

function versionsFor(app) {
  const files = filesFor(app);
  const { crate } = APPS[app];

  const cargoToml = read(files["Cargo.toml"]).match(
    /^\s*\[package\][\s\S]*?^\s*version\s*=\s*"([^"]+)"/m,
  );
  if (!cargoToml) fail(`could not read a [package] version from ${files["Cargo.toml"]}`);

  const lock = lockEntry(read(files["Cargo.lock"]), crate);
  if (!lock) fail(`no [[package]] entry named "${crate}" in ${files["Cargo.lock"]}`);

  return {
    "package.json": JSON.parse(read(files["package.json"])).version,
    "tauri.conf.json": JSON.parse(read(files["tauri.conf.json"])).version,
    "Cargo.toml": cargoToml[1],
    "Cargo.lock": lock.version,
  };
}

function check(apps) {
  let bad = false;

  for (const app of apps) {
    const found = versionsFor(app);
    const distinct = [...new Set(Object.values(found))];

    if (distinct.length === 1) {
      process.stdout.write(`${app}: ${distinct[0]} — all four agree\n`);
      continue;
    }

    bad = true;
    // Name every file and its value. "Versions disagree" without the values
    // just makes the reader open four files to learn what this already knows.
    process.stderr.write(`${app}: versions disagree\n`);
    for (const [label, value] of Object.entries(found)) {
      process.stderr.write(`  ${label.padEnd(16)} ${value}\n`);
    }
    process.stderr.write(`  fix with: node scripts/version.mjs set ${app} <version>\n`);
  }

  process.exit(bad ? 1 : 0);
}

function set(app, version) {
  if (!SEMVER.test(version)) fail(`"${version}" is not a bare x.y.z version`);

  const files = filesFor(app);
  const { crate } = APPS[app];
  const write = (relative, text) => writeFileSync(resolve(ROOT, relative), text);

  // JSON is rewritten by string replacement rather than parse-and-stringify so
  // that key order, indentation, and the trailing newline survive untouched —
  // a release commit should show one changed line per file, not a reformat.
  for (const key of ["package.json", "tauri.conf.json"]) {
    const text = read(files[key]);
    const next = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
    if (next === text) fail(`no "version" field to replace in ${files[key]}`);
    write(files[key], next);
  }

  const toml = read(files["Cargo.toml"]);
  const nextToml = toml.replace(
    /(^\s*\[package\][\s\S]*?^\s*version\s*=\s*")[^"]+(")/m,
    `$1${version}$2`,
  );
  if (nextToml === toml) fail(`no [package] version to replace in ${files["Cargo.toml"]}`);
  write(files["Cargo.toml"], nextToml);

  // Prefer cargo: it revalidates the whole graph while it rewrites the entry.
  // The regex fallback exists so this still works without a Rust toolchain,
  // and says which one it used so an unexpected lockfile diff is explainable.
  const cargo = spawnSync(
    "cargo",
    ["update", "-p", crate, "--precise", version, "--quiet"],
    {
      cwd: resolve(ROOT, `${APPS[app].dir}/src-tauri`),
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    },
  );

  // Three outcomes, not two. "cargo is not installed" is the only one the
  // regex may stand in for; a cargo that ran and refused — a lock conflict, an
  // unresolvable graph — is a real failure, and falling back would quietly
  // write a lockfile cargo had just declined to write. The manifests are
  // already updated at this point, so it fails loudly and says so.
  if (cargo.status === 0) {
    process.stdout.write(`${app}: set to ${version} (Cargo.lock updated by cargo)\n`);
  } else if (cargo.error?.code === "ENOENT") {
    const text = read(files["Cargo.lock"]);
    const entry = lockEntry(text, crate);
    if (!entry) fail(`no [[package]] entry named "${crate}" in ${files["Cargo.lock"]}`);
    write(files["Cargo.lock"], text.replace(entry.pattern, `$1${version}$3`));
    process.stdout.write(`${app}: set to ${version} (Cargo.lock edited directly — cargo not installed)\n`);
  } else {
    fail(
      `the manifests are now ${version}, but cargo could not update ` +
        `${files["Cargo.lock"]}:\n${(cargo.stderr || "").trim() || `exit code ${cargo.status}`}`,
    );
  }
}

const [command, ...rest] = process.argv.slice(2);
const names = Object.keys(APPS);

if (command === "check") {
  const apps = rest.length ? rest : names;
  for (const app of apps) if (!APPS[app]) fail(`unknown app "${app}". Known: ${names.join(", ")}`);
  check(apps);
} else if (command === "set") {
  const [app, version] = rest;
  if (!APPS[app]) fail(`unknown app "${app}". Known: ${names.join(", ")}`);
  if (!version) fail("set needs a version: node scripts/version.mjs set <app> <x.y.z>");
  set(app, version);
} else {
  fail(`usage:
  node scripts/version.mjs check [app...]
  node scripts/version.mjs set <app> <x.y.z>
apps: ${names.join(", ")}`);
}
