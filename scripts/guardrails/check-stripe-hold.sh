#!/usr/bin/env bash
# Guardrail 10: refuse prod deploy while any applicable Stripe HOLD exists.
set -euo pipefail

product="${1:-}"
candidates=()
[[ -n "${STRIPE_HOLD_FILE:-}" ]] && candidates+=("$STRIPE_HOLD_FILE")
candidates+=("STRIPE_HOLD" "./STRIPE_HOLD")
candidates+=("/workspace/house/forge/STRIPE-HOLD")
candidates+=("$HOME/Projects/_ops/STRIPE-HOLD")

# Dedup existing files, preserve order
declare -a holds=()
for c in "${candidates[@]}"; do
  [[ -f "$c" ]] || continue
  skip=0
  for h in "${holds[@]:-}"; do
    [[ "$h" == "$c" ]] && skip=1 && break
  done
  [[ $skip -eq 1 ]] && continue
  holds+=("$c")
done

if [[ ${#holds[@]} -eq 0 ]]; then
  echo "check-stripe-hold: ok (no HOLD file)"
  exit 0
fi

product_held_by=""
for hold in "${holds[@]}"; do
  if [[ -z "$product" ]]; then
    product_held_by="$hold"
    break
  fi
  # Only honor an explicit products: line; comment-only lines ignored via grep on that key.
  if grep -qiE '^[[:space:]]*products[[:space:]]*:' "$hold"; then
    # Match product as a list item (not inside comments after # on that line)
    if awk -v p="$product" '
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
    ' "$hold"; then
      product_held_by="$hold"
      break
    fi
  else
    # No products list => holds everything
    product_held_by="$hold"
    break
  fi
done

if [[ -z "$product_held_by" ]]; then
  echo "check-stripe-hold: ok ($product not held by any HOLD file)"
  exit 0
fi

echo "check-stripe-hold: FAIL — Stripe HOLD active at $product_held_by" >&2
echo "  Held until live Stripe keys exist. Remove HOLD only with Cohen's yes." >&2
[[ -n "$product" ]] && echo "  product: $product" >&2
# Also mention other HOLD files present
for hold in "${holds[@]}"; do
  [[ "$hold" == "$product_held_by" ]] && continue
  echo "  also present: $hold" >&2
done
exit 1
