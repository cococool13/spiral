#!/usr/bin/env bash
# Guardrail 9: DMG must be signed, stapled, Gatekeeper-openable, and match live SHA-256.
# Mac only (stapler, spctl, codesign).
#
# Usage:
#   check-dmg-release.sh <path-to.dmg> [--live-url URL] [--skip-live]
# Env: LIVE_DOWNLOAD_URL as alternative to --live-url
set -euo pipefail

dmg=""
live_url="${LIVE_DOWNLOAD_URL:-}"
skip_live=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --live-url) live_url="${2:-}"; shift 2 ;;
    --skip-live) skip_live=1; shift ;;
    -h|--help)
      echo "usage: check-dmg-release.sh <dmg> [--live-url URL] [--skip-live]"
      exit 0
      ;;
    *)
      if [[ -z "$dmg" ]]; then dmg="$1"; shift; else echo "unexpected: $1" >&2; exit 2; fi
      ;;
  esac
done

if [[ -z "$dmg" || ! -f "$dmg" ]]; then
  echo "check-dmg-release: FAIL — DMG not found: ${dmg:-<empty>}" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "check-dmg-release: FAIL — macOS required (stapler/spctl)" >&2
  exit 2
fi

echo "check-dmg-release: codesign --verify --verbose=4 $dmg"
codesign --verify --verbose=4 "$dmg"
echo "check-dmg-release: stapler validate $dmg"
xcrun stapler validate "$dmg"
echo "check-dmg-release: spctl -a -t open --context context:primary-signature $dmg"
spctl -a -t open --context context:primary-signature "$dmg"

local_sha=$(shasum -a 256 "$dmg" | awk '{print $1}')
echo "check-dmg-release: local sha256 $local_sha"

if [[ "$skip_live" -eq 1 ]]; then
  echo "check-dmg-release: ok (live hash skipped)"
  exit 0
fi

if [[ -z "$live_url" ]]; then
  echo "check-dmg-release: FAIL — pass --live-url or LIVE_DOWNLOAD_URL (or --skip-live)" >&2
  exit 1
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
echo "check-dmg-release: fetching $live_url"
# Fail on HTTP errors; follow redirects
curl -fsSL "$live_url" -o "$tmp"
live_sha=$(shasum -a 256 "$tmp" | awk '{print $1}')
echo "check-dmg-release: live sha256 $live_sha"

if [[ "$local_sha" != "$live_sha" ]]; then
  echo "check-dmg-release: FAIL — live download hash mismatch" >&2
  echo "  local: $local_sha" >&2
  echo "  live:  $live_sha" >&2
  exit 1
fi

echo "check-dmg-release: ok (staple + spctl + live hash match)"
