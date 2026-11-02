#!/usr/bin/env bash
# Guardrail 8: a fix:/bug PR must touch a lint/hook/test file and include a Rule: line.
set -euo pipefail

title="${1:-${PR_TITLE:-}}"
body_src="${2:-}"
files_src="${3:-}"

if [[ -z "$title" || -z "$body_src" || -z "$files_src" ]]; then
  echo "usage: check-bug-then-rule.sh <pr-title> <pr-body-file|-> <changed-files-file>" >&2
  exit 2
fi

if [[ "$body_src" == "-" ]]; then body="${PR_BODY:-}"; else body=$(cat "$body_src"); fi
if [[ "$files_src" == "-" ]]; then files="${CHANGED_FILES:-}"; else files=$(cat "$files_src"); fi

labels="${PR_LABELS:-}"
is_fix=0
if printf '%s\n' "$title" | grep -qiE '^(fix|bug)([/:!(]|$)'; then is_fix=1; fi
if printf '%s\n' "$labels" | grep -qiE '(^|,)[[:space:]]*(fix|bug)[[:space:]]*(,|$)'; then is_fix=1; fi

if [[ "$is_fix" -eq 0 ]]; then
  echo "check-bug-then-rule: skip (not a fix:/bug PR)"
  exit 0
fi

if ! printf '%s\n' "$body" | grep -qE '^[[:space:]]*Rule:[[:space:]]*[^[:space:]].*'; then
  if ! printf '%s\n' "$body" | grep -qiE 'lint is impossible|cannot be linted|why lint is impossible'; then
    echo "check-bug-then-rule: FAIL — fix:/bug PR needs a 'Rule:' line (or why lint is impossible)" >&2
    exit 1
  fi
fi

if ! printf '%s\n' "$files" | grep -qiE \
  '(^|/)(\.swiftlint\.yml|eslint\.config\.[cm]?[jt]s|\.eslintrc(\.json)?|biome\.json|oxlint\.json|\.oxlintrc.*|lefthook\.ya?ml)$|(^|/)\.githooks/|(^|/)([^/]*pre-push[^/]*)$|(^|/)(test|tests|Tests|XCTest|__tests__)(/|$)|(^|/).*\.(test|spec)\.[jt]sx?$|(^|/).*(Tests|UITests)\.swift$|(^|/)[^/]*_test\.py$|(^|/)scripts/guardrails/|(^|/)scripts/check-[^/]+$'; then
  echo "check-bug-then-rule: FAIL — fix:/bug PR must touch a lint config, hook, or test file" >&2
  echo "changed files:" >&2
  printf '%s\n' "$files" >&2
  exit 1
fi

echo "check-bug-then-rule: ok"
