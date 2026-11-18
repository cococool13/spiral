#!/usr/bin/env bash
# Guardrail 7: PR body must contain Reviewed-by: claude|codex @ <head-sha>
# matching the current HEAD (or REVIEWED_SHA / GITHUB_SHA).
#
# Usage:
#   check-reviewed-by.sh <pr-body-file> [head-sha]
#   PR_BODY='...' check-reviewed-by.sh - [head-sha]
# Env: REVIEWED_SHA or GITHUB_SHA used when head-sha omitted.
set -euo pipefail

body_src="${1:-}"
head_sha="${2:-${REVIEWED_SHA:-${GITHUB_SHA:-}}}"

if [[ -z "$body_src" ]]; then
  echo "usage: check-reviewed-by.sh <pr-body-file|-> [head-sha]" >&2
  exit 2
fi

if [[ -z "$head_sha" ]]; then
  if git rev-parse HEAD >/dev/null 2>&1; then
    head_sha=$(git rev-parse HEAD)
  else
    echo "check-reviewed-by: no head sha (pass arg or set GITHUB_SHA)" >&2
    exit 2
  fi
fi

if [[ "$body_src" == "-" ]]; then
  body="${PR_BODY:-}"
else
  body=$(cat "$body_src")
fi

# Accept full sha or unique prefix (≥7). CLI must be claude or codex.
# Example: Reviewed-by: claude @ abcdef1
line=$(printf '%s\n' "$body" | grep -E '^[[:space:]]*Reviewed-by:[[:space:]]*(claude|codex)[[:space:]]+@[[:space:]]*[0-9a-fA-F]{7,40}[[:space:]]*$' | head -n1 || true)

if [[ -z "$line" ]]; then
  echo "check-reviewed-by: FAIL — missing line 'Reviewed-by: claude|codex @ <sha>'" >&2
  exit 1
fi

sha=$(printf '%s\n' "$line" | sed -E 's/.*@[[:space:]]*([0-9a-fA-F]{7,40}).*/\1/')
sha_lc=$(printf '%s' "$sha" | tr 'A-F' 'a-f')
head_lc=$(printf '%s' "$head_sha" | tr 'A-F' 'a-f')

case "$head_lc" in
  "$sha_lc"|"$sha_lc"*) ;;
  *)
    # also allow head starting with sha (prefix match either way if sha shorter)
    if [[ "$sha_lc" == "$head_lc"* || "$head_lc" == "$sha_lc"* ]]; then
      :
    else
      echo "check-reviewed-by: FAIL — Reviewed-by sha $sha does not match head $head_sha" >&2
      exit 1
    fi
    ;;
esac

echo "check-reviewed-by: ok ($line)"
