#!/usr/bin/env bash
# Guardrail 5: refuse "green with zero checks".
# Expects a JSON file from `gh pr checks --json name,state,bucket` or Checks API
# rollup: array of {name,state} or {name,conclusion,status}.
#
# Success = at least one required (or all listed) check completed success.
# Queued / pending / missing / skipped-void = not green.
#
# Usage:
#   check-required-checks-green.sh <checks.json> [--required name1,name2]
# If --required omitted, every check in the file must be success and count ≥ 1.
set -euo pipefail

json_file="${1:-}"
shift || true
required=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --required) required="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$json_file" || ! -f "$json_file" ]]; then
  echo "usage: check-required-checks-green.sh <checks.json> [--required a,b]" >&2
  exit 2
fi

export CHECKS_JSON_FILE="$json_file"
export REQUIRED_NAMES="$required"
python3 - <<'PY'
import json, os, sys

path = os.environ["CHECKS_JSON_FILE"]
required = [x.strip() for x in os.environ.get("REQUIRED_NAMES", "").split(",") if x.strip()]
raw = open(path).read().strip()
if not raw:
    print("check-required-checks-green: FAIL — empty checks (zero checks ≠ green)", file=sys.stderr)
    sys.exit(1)
data = json.loads(raw)
if isinstance(data, dict) and "check_runs" in data:
    data = data["check_runs"]
if not isinstance(data, list):
    print("check-required-checks-green: FAIL — expected a JSON array", file=sys.stderr)
    sys.exit(1)
if len(data) == 0:
    print("check-required-checks-green: FAIL — zero checks reported (not green)", file=sys.stderr)
    sys.exit(1)

def name_of(c):
    return c.get("name") or c.get("context") or ""

def is_success(c):
    state = (c.get("state") or c.get("conclusion") or "").lower()
    status = (c.get("status") or c.get("bucket") or "").lower()
    if state in ("success", "pass", "passed", "neutral"):
        # neutral alone is not enough for required; treat success/pass only
        return state in ("success", "pass", "passed")
    if status in ("pass", "success"):
        return True
    return False

def is_complete(c):
    status = (c.get("status") or "").lower()
    state = (c.get("state") or c.get("conclusion") or c.get("bucket") or "").lower()
    if status in ("queued", "in_progress", "pending", "waiting", "requested", "running"):
        return False
    if state in ("pending", "queued", "in_progress", "running", "waiting"):
        return False
    return True

checks = data
if required:
    by_name = {name_of(c): c for c in checks}
    missing = [n for n in required if n not in by_name]
    if missing:
        print(f"check-required-checks-green: FAIL — required checks missing: {missing}", file=sys.stderr)
        sys.exit(1)
    checks = [by_name[n] for n in required]

fail = []
for c in checks:
    n = name_of(c)
    if not is_complete(c):
        fail.append(f"{n}: incomplete ({c})")
    elif not is_success(c):
        fail.append(f"{n}: not success ({c.get('state') or c.get('conclusion') or c.get('bucket')})")

if fail:
    print("check-required-checks-green: FAIL", file=sys.stderr)
    for f in fail:
        print(f"  - {f}", file=sys.stderr)
    sys.exit(1)

print(f"check-required-checks-green: ok ({len(checks)} check(s))")
PY
