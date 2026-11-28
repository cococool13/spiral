# Spiral Collection — Manual Release Runbook

Moved from `AGENTS.md`.

**Cut every release with `node scripts/release.mjs spiral <x.y.z>`**, never a bare `git tag`.
It bumps the four version files, commits, and tags that commit (pushes only with `--push`).
`node scripts/version.mjs tag <tag>` inspects an existing tag.

**After any release, `collection/lib/apps.ts` goes stale.** Check with
`node scripts/downloads.mjs latest` (nothing runs it automatically).

Live tags are `v2` and later. `v1`, `slim-v*`, `clean-v*`, and `resume-v*` are retired.
`node scripts/version.mjs tag` prints `retired` for those and exits 0.
Release builds are manual until replaced: GitHub Actions is disabled and the old
`release-app.yml` workflow is deleted, so a pushed tag builds nothing. Builds need the
sidecar and `src-tauri/tauri.bundle.conf.json`. Models download at runtime.
The deleted workflows are the step list: `git show df14ebf:.github/workflows/release-app.yml`,
run with the inputs from the `release` job in `git show df14ebf:.github/workflows/build.yml`
(updater and github-latest on, Windows off). So: `make-release-manifest.mjs --no-windows`,
and publish with `gh release ... --latest=true`. The workflow defaults leave both off.
A release is not complete without the updater assets: the signed `*.app.tar.gz` and
`.sig`, plus the `latest.json` from `apps/spiral/scripts/make-release-manifest.mjs`.
Installed copies fetch `latest.json`, so a release with only the DMG strands them.
Publish the GitHub release with every asset before deploying the catalogue that links it.

**Every macOS release:** bump the matching cask in
[`cococool13/homebrew-spiral`](https://github.com/cococool13/homebrew-spiral)
(`version` + `.dmg` line from `SHA256SUMS.txt`).
