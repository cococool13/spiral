#!/usr/bin/env bash
# Point this clone at .githooks. Once per clone:
#
#   ./scripts/setup-hooks.sh
#
# The pre-push hook then runs `just check` on each commit being pushed.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
git -C "$root" config core.hooksPath .githooks
printf 'core.hooksPath=.githooks\n'
printf 'pre-push runs just check on each pushed commit.\n'
