#!/bin/sh
# Render every artboard HTML to a 1440x900 PNG in $1 (default: ./out).
# Chrome needs to run outside a sandboxed shell (it binds a local socket).
cd "$(dirname "$0")"
out="${1:-out}"; mkdir -p "$out"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
prof="$(mktemp -d)"
for f in ${ONLY:-*.html}; do
  "$chrome" --headless=new --disable-gpu --user-data-dir="$prof" --allow-file-access-from-files \
    --hide-scrollbars --force-device-scale-factor=1 --window-size=1440,900 \
    --screenshot="$out/${f%.html}.png" "file://$PWD/$f" >/dev/null 2>&1
done
rm -rf "$prof"
ls "$out"
