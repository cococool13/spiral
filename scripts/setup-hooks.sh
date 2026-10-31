#!/usr/bin/env bash
# Point this clone at .githooks. Once per clone:
#
#   ./scripts/setup-hooks.sh
#
# The pre-push hook then runs the fast checks on the commits being pushed.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
git -C "$root" config core.hooksPath .githooks
printf 'core.hooksPath=.githooks\n'
printf 'pre-push runs format, lint, and typecheck for changed TypeScript, plus rustfmt and clippy for changed Rust crates.\n'
