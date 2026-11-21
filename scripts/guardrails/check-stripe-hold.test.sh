#!/usr/bin/env bash
# Regression: awk END{exit 1} must not clobber a product match (guardrail 10).
# Old pattern exits 1 even when the product is listed; fixed pattern exits 0 on match.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CHECK="${ROOT}/check-stripe-hold.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

hold="$tmp/STRIPE-HOLD"
# Synthetic product names only (avoid stacks-cloud denylist brand words).
printf '%s\n' '# test hold' 'products: HeldApp, OtherApp, licensing' >"$hold"
HELD=HeldApp
FREE=FreeApp

old_awk() {
  awk -v p="$1" '
    BEGIN{IGNORECASE=1}
    /^[[:space:]]*products[[:space:]]*:/ {
      line=$0; sub(/#.*/,"",line)
      n=split(line, a, /[:,]/)
      for(i=1;i<=n;i++){
        gsub(/^[[:space:]]+|[[:space:]]+$/,"",a[i])
        if (tolower(a[i])==tolower(p)) exit 0
      }
    }
    END{exit 1}
  ' "$hold"
}

new_awk() {
  awk -v p="$1" '
    BEGIN{IGNORECASE=1; found=0}
    /^[[:space:]]*products[[:space:]]*:/ {
      line=$0; sub(/#.*/,"",line)
      n=split(line, a, /[:,]/)
      for(i=1;i<=n;i++){
        gsub(/^[[:space:]]+|[[:space:]]+$/,"",a[i])
        if (tolower(a[i])==tolower(p)) found=1
      }
    }
    END{ exit found ? 0 : 1 }
  ' "$hold"
}

echo "test: old awk must FAIL to recognize $HELD (documents the bug)"
if old_awk "$HELD"; then
  echo "FAIL: old awk unexpectedly matched $HELD" >&2
  exit 1
fi
echo "  old awk exit≠0 on $HELD — as expected for the buggy pattern"

echo "test: new awk must recognize $HELD"
if ! new_awk "$HELD"; then
  echo "FAIL: new awk did not match $HELD" >&2
  exit 1
fi
echo "  new awk exit=0 on $HELD — ok"

echo "test: new awk must miss $FREE"
if new_awk "$FREE"; then
  echo "FAIL: new awk matched $FREE" >&2
  exit 1
fi
echo "  new awk exit≠0 on $FREE — ok"

echo "test: check-stripe-hold.sh $HELD must FAIL (held)"
if STRIPE_HOLD_FILE="$hold" bash "$CHECK" "$HELD"; then
  echo "FAIL: check-stripe-hold.sh did not hold $HELD" >&2
  exit 1
fi
echo "  script holds $HELD — ok"

echo "test: check-stripe-hold.sh $FREE must pass"
if ! STRIPE_HOLD_FILE="$hold" bash "$CHECK" "$FREE"; then
  echo "FAIL: check-stripe-hold.sh held $FREE" >&2
  exit 1
fi
echo "  script frees $FREE — ok"

if grep -qE 'END\{exit 1\}' "$CHECK"; then
  echo "FAIL: $CHECK still has END{exit 1} (old buggy pattern)" >&2
  exit 1
fi
if ! grep -q 'found=0' "$CHECK"; then
  echo "FAIL: $CHECK missing found=0 fix marker" >&2
  exit 1
fi
echo "  source contains found=0 fix — ok"

echo "check-stripe-hold.test.sh: all passed"
