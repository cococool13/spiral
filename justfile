# CI contract. Agents, the pre-push hook and `ship` all run `just check`.
# Kit: .ci/ (vendored with ci-sync; `just ci-drift` shows drift).
# GitHub Actions still run here too (public repo). Not in `just check`, and why:
#   build.yml windows: Windows packaging build, needs a Windows runner.
#   build.yml release/docs, release-app.yml: tag-only release path (signing).
#   build.yml website deploy: runs on GitHub on push to main.
#   versions.yml tag/downloads: tag-only, and `downloads.mjs latest` reads
#   live GitHub releases (run by hand after a release).
#   dependabot-auto-merge.yml: not a check.
set shell := ["bash", "-euo", "pipefail", "-c"]

# taste runs first and alone: it scans the tree, and the other recipes write
# build output (out/, dist/, target/) and synced brand files mid-scan.
check: setup
    .ci/bin/ci-par --pre taste site app license checkout versions gitleaks

# Changed files since origin/main plus uncommitted work: biome and
# tsc for changed TypeScript, check-hex, rustfmt and budgeted clippy for
# changed crates (scripts/fast-checks.sh, the old pre-push hook).
check-fast: setup
    #!/usr/bin/env bash
    set -euo pipefail
    # A throwaway commit of the working tree (untracked files included), built
    # on a copy of the index so nothing in the checkout changes.
    idx="$(mktemp)"; trap 'rm -f "$idx"' EXIT
    cp "$(git rev-parse --git-path index)" "$idx"
    GIT_INDEX_FILE="$idx" git add -A
    sha="$(git commit-tree "$(GIT_INDEX_FILE="$idx" git write-tree)" -p HEAD -m check-fast)"
    printf 'refs/heads/check-fast %s refs/heads/check-fast %s\n' "$sha" 0000000000000000000000000000000000000000 | bash scripts/fast-checks.sh

fix:
    cd collection && pnpm format

test: setup
    .ci/bin/ci-par app license

setup:
    [ collection/node_modules/.modules.yaml -nt collection/pnpm-lock.yaml ] || (cd collection && pnpm install --frozen-lockfile)
    [ apps/spiral/node_modules/.modules.yaml -nt apps/spiral/pnpm-lock.yaml ] || (cd apps/spiral && pnpm install --frozen-lockfile)

# build.yml website job (deploy excluded): sync-brand, lint, typecheck, build.
site:
    cd collection && pnpm sync-brand && pnpm lint && pnpm typecheck && pnpm build

# build.yml spiral job. The Rust build embeds apps/spiral/dist, so the frontend
# builds first.
app: app-frontend app-rust

app-frontend:
    cd apps/spiral && pnpm sync-brand && pnpm check:hex && pnpm exec tsc --noEmit && pnpm build && pnpm test

app-rust:
    cd apps/spiral/src-tauri && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings

# license.yml crate job (the hosted matrix also runs it on Linux and Windows).
license:
    cd crates/spiral-license && cargo test

# build.yml website job and license.yml checkout-urls job.
checkout:
    node scripts/check-checkout.mjs

# versions.yml check job.
versions:
    node scripts/version.mjs check
    node scripts/downloads.mjs check

# ci.yml: full history, with .gitleaks.toml and .gitleaksignore.
gitleaks:
    gitleaks git --no-banner --redact .

# design-guard.yml (taste on pull requests).
taste:
    .ci/bin/ci-taste v1

ci-drift:
    .ci/bin/ci-sync --check .
