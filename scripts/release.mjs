#!/usr/bin/env node
// Cut a release without being able to get it wrong.
//
//   node scripts/release.mjs clean 0.1.0          bump, commit, tag — no push
//   node scripts/release.mjs clean 0.1.0 --push   ...and push it
//
// **Why this exists.** Releasing used to be `git tag vX && git push`, with the
// version bump a separate commit you were trusted to land first. On 2026-08-02
// that trust failed twice in ten seconds: `v1.0.3` and `slim-v1.0.1` were both
// tagged on commits that predated their bumps, so the version files still said
// 1.0.2 and 1.0.0. Both builds signed and notarized successfully, and both were
// thrown away at the publish step by a guard doing exactly its job.
//
// The fix is not a better warning. It is ordering: this script writes the bump
// and tags *that* commit, so the tag can never point at a tree whose version
// files disagree with it. Everything else here is preflight — the checks that
// turn a thirty-minute failure into a one-second one.
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APPS = {
  wallpaper: { tag: (v) => `v${v}`, name: "Spiral Wallpaper", builds: "macOS + Windows" },
  slim: { tag: (v) => `slim-v${v}`, name: "Spiral Slim", builds: "macOS" },
  clean: { tag: (v) => `clean-v${v}`, name: "Spiral Clean", builds: "macOS" },
};

const SEMVER = /^\d+\.\d+\.\d+$/;

const die = (message) => {
  process.stderr.write(`\nrelease: ${message}\n\n`);
  process.exit(1);
};

const say = (message) => process.stdout.write(`${message}\n`);

/** Run a command, returning trimmed stdout. Throws on failure by default. */
function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  if (result.error) die(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    die(`${command} ${args.join(" ")} failed:\n${(result.stderr || result.stdout || "").trim()}`);
  }
  return { ok: result.status === 0, out: (result.stdout || "").trim(), err: (result.stderr || "").trim() };
}

const [app, version, ...flags] = process.argv.slice(2);
const push = flags.includes("--push");

if (!APPS[app] || !version) {
  die(`usage: node scripts/release.mjs <app> <x.y.z> [--push]
apps: ${Object.keys(APPS).join(", ")}`);
}
if (!SEMVER.test(version)) die(`"${version}" is not a three-part version like 1.0.3.`);

const { tag: tagFor, name, builds } = APPS[app];
const tag = tagFor(version);

// ---------------------------------------------------------------------------
// Preflight. Every one of these has cost a real release or nearly has.
// ---------------------------------------------------------------------------

say(`\nReleasing ${name} ${version}  ->  ${tag}  (${builds})\n`);

// A dirty tree means the tagged commit would contain whatever you had open,
// and a release is the worst place to discover that.
if (run("git", ["status", "--porcelain"]).out) {
  die("the working tree has uncommitted changes. Commit or stash them first.");
}

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).out;
if (branch !== "main") {
  die(`you are on "${branch}". Releases are cut from main, so the tag points at what shipped.`);
}

// Behind origin means tagging a commit the rest of the world does not have as
// the tip — the release would omit whatever landed since.
run("git", ["fetch", "origin", "--quiet", "--tags"]);
const behind = run("git", ["rev-list", "--count", "HEAD..origin/main"]).out;
if (behind !== "0") {
  die(`main is ${behind} commit(s) behind origin. Pull first, or the release omits them.`);
}

// An existing tag is either a re-release (which needs a deliberate force) or a
// typo. Neither should be resolved silently.
if (run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { allowFailure: true }).ok) {
  die(`tag ${tag} already exists locally. Pick another version, or delete it deliberately.`);
}
if (run("git", ["ls-remote", "--tags", "origin", tag]).out) {
  die(`tag ${tag} already exists on origin. That version has been cut before.`);
}

// Going backwards produces an "update" that installs an older build than the
// one already running — the failure an updater cannot recover from.
const current = run("node", ["scripts/version.mjs", "check", app]).out.match(/(\d+\.\d+\.\d+)/)?.[1];
if (current) {
  const rank = (v) => v.split(".").map(Number);
  const [a, b, c] = rank(version);
  const [x, y, z] = rank(current);
  if (a * 1e6 + b * 1e3 + c <= x * 1e6 + y * 1e3 + z) {
    die(`${app} is already ${current}. ${version} is not newer, so this would ship a downgrade.`);
  }
  say(`  ${current}  ->  ${version}`);
}

// ---------------------------------------------------------------------------
// Write, verify, commit, tag. In that order, which is the whole point.
// ---------------------------------------------------------------------------

say("\nWriting the four version files…");
run("node", ["scripts/version.mjs", "set", app, version]);

// Belt and braces: `set` just wrote them, and this proves it, so a tag is
// never created over files that only *should* be right.
say("Checking they agree…");
say(`  ${run("node", ["scripts/version.mjs", "check", app]).out}`);

const changed = run("git", ["status", "--porcelain"]).out;
if (!changed) die("nothing changed — the version files already said " + version + ".");
say(`\nCommitting ${changed.split("\n").length} file(s)…`);
run("git", ["commit", "-aqm", `chore: release ${name} ${version}`]);

// The tag lands on the commit that carries the bump. This single ordering is
// what makes the 2026-08-02 failure unreachable.
run("git", ["tag", "-a", tag, "-m", `${name} ${version}`]);
say(`Tagged ${tag} on ${run("git", ["rev-parse", "--short", "HEAD"]).out}`);

// Final proof, against the tree as it now stands.
run("node", ["scripts/version.mjs", "tag", tag]);
say(`Verified ${tag} against the version files.`);

if (!push) {
  say(`
Nothing has been pushed. Publishing is a separate, deliberate act:

  git push origin main ${tag}

or re-run this with --push. Once the tag is on origin, CI builds, signs,
notarizes and publishes a public release — there is no undo for that.
`);
  process.exit(0);
}

say("\nPushing main and the tag…");
run("git", ["push", "origin", "main", tag]);
say(`
Pushed. CI is building ${name} ${version}.

  gh run watch
  gh release view ${tag}
`);
