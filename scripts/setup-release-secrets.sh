#!/usr/bin/env bash
#
# Puts the six Apple secrets the `macos` release job needs into GitHub.
#
# Everything is read here and piped straight to `gh secret set`. No value is
# printed, written to a file, or kept in shell history — the only copy that
# leaves this machine is the encrypted one GitHub stores.
#
#   ./scripts/setup-release-secrets.sh
#
# Two of the six are read from your keychain, so there are four things to type.
set -euo pipefail

REPO="cococool13/spiral-wallpaper"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }
die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

command -v gh >/dev/null || die "gh is not installed. brew install gh"
gh auth status >/dev/null 2>&1 || die "gh is not signed in. Run: gh auth login"

bold "Release secrets for $REPO"
echo

# --- derived from the keychain -------------------------------------------
# The certificate is already installed locally, so its exact name and the team
# it belongs to can be read rather than typed. tauri.conf.json pins the same
# identity string, and a mismatch here fails the build with a signing error
# that does not say which of the two is wrong.
IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null \
  | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -1)
[ -n "$IDENTITY" ] || die "No 'Developer ID Application' certificate in your keychain.
  Download it from developer.apple.com -> Certificates, then double-click to install."

TEAM_ID=$(printf '%s' "$IDENTITY" | sed -n 's/.*(\([A-Z0-9]*\))$/\1/p')
[ -n "$TEAM_ID" ] || die "Could not read a team ID out of: $IDENTITY"

echo "Signing identity : $IDENTITY"
echo "Team ID          : $TEAM_ID"
dim "  (both read from your keychain — nothing to type)"
echo

# --- the .p12 -------------------------------------------------------------
bold "1/4  Developer ID certificate (.p12)"
dim "Keychain Access -> login -> My Certificates -> right-click"
dim "\"$IDENTITY\" -> Export -> .p12, and set a password when asked."
echo
read -r -p "Path to the .p12 file: " P12_PATH
P12_PATH="${P12_PATH/#\~/$HOME}"
# Strip the quotes Finder's "Copy as Pathname" and drag-and-drop leave behind.
P12_PATH="${P12_PATH%\"}"; P12_PATH="${P12_PATH#\"}"
P12_PATH="${P12_PATH%\'}"; P12_PATH="${P12_PATH#\'}"
[ -f "$P12_PATH" ] || die "No file at: $P12_PATH"

bold "2/4  Password you set on that .p12"
read -r -s -p "Certificate password: " P12_PASSWORD; echo
# Check it opens before uploading. Otherwise the first tagged release fails
# minutes into a macOS runner with "MAC verification failed", and the cause is
# a typo made here.
#
# Keychain Access still exports .p12 with pbeWithSHA1And40BitRC2-CBC. OpenSSL 3
# moved RC2 out of the default provider, so on a machine where `openssl` is
# Homebrew's the check below fails with "unsupported" no matter how right the
# password is. `-legacy` loads that provider back; LibreSSL — Apple's
# /usr/bin/openssl — has no such flag and needs none, so probe for it.
if openssl pkcs12 -legacy -help >/dev/null 2>&1; then
  P12_CHECK=(openssl pkcs12 -legacy)
else
  P12_CHECK=(openssl pkcs12)
fi

# Report what openssl actually said rather than discarding it. Swallowing
# stderr is what let a legacy-cipher failure masquerade as a wrong password.
if ! P12_ERROR=$("${P12_CHECK[@]}" -in "$P12_PATH" -passin pass:"$P12_PASSWORD" \
                   -noout 2>&1); then
  die "That password does not open $P12_PATH. Nothing was uploaded.
  openssl: $(printf '%s' "$P12_ERROR" | head -1)"
fi
dim "  certificate opens — good"
echo

# --- notarization ---------------------------------------------------------
bold "3/4  Apple ID used for notarization"
dim "The account that owns the developer membership."
read -r -p "Apple ID email: " APPLE_ID_VALUE
[ -n "$APPLE_ID_VALUE" ] || die "Apple ID cannot be empty."
echo

bold "4/4  App-specific password"
dim "NOT your Apple ID password — notarization rejects that."
dim "Make one at appleid.apple.com -> Sign-In and Security ->"
dim "App-Specific Passwords. It looks like abcd-efgh-ijkl-mnop."
echo
read -r -s -p "App-specific password: " APPLE_PASSWORD_VALUE; echo
if ! printf '%s' "$APPLE_PASSWORD_VALUE" | grep -Eq '^[a-z]{4}(-[a-z]{4}){3}$'; then
  dim "  that is not the usual xxxx-xxxx-xxxx-xxxx shape"
  read -r -p "  use it anyway? [y/N] " confirm
  [ "$confirm" = "y" ] || [ "$confirm" = "Y" ] || die "Stopped. Nothing was uploaded."
fi
echo

# --- upload ---------------------------------------------------------------
bold "Uploading to $REPO"
# `gh secret set` reads the value from stdin whenever --body is absent, which
# is the only way to pass one without putting it in the argument list. There is
# no --body-file flag on `secret set` — that belongs to `gh api`.
set_secret() {
  printf '%s' "$2" | gh secret set "$1" --repo "$REPO" \
    && echo "  set $1" || die "failed to set $1"
}

base64 -i "$P12_PATH" | gh secret set APPLE_CERTIFICATE --repo "$REPO" \
  && echo "  set APPLE_CERTIFICATE" || die "failed to set APPLE_CERTIFICATE"
set_secret APPLE_CERTIFICATE_PASSWORD "$P12_PASSWORD"
set_secret APPLE_SIGNING_IDENTITY "$IDENTITY"
set_secret APPLE_ID "$APPLE_ID_VALUE"
set_secret APPLE_PASSWORD "$APPLE_PASSWORD_VALUE"
set_secret APPLE_TEAM_ID "$TEAM_ID"

unset P12_PASSWORD APPLE_PASSWORD_VALUE

echo
bold "Configured secrets (names only — GitHub never shows values back)"
gh secret list --repo "$REPO"

echo
MISSING=""
CONFIGURED=$(gh secret list --repo "$REPO" | awk '{print $1}')
for name in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY \
            APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID TAURI_SIGNING_PRIVATE_KEY; do
  printf '%s\n' "$CONFIGURED" | grep -qx "$name" || MISSING="$MISSING $name"
done

if [ -n "$MISSING" ]; then
  die "still missing:$MISSING"
fi

bold "All seven present. A release is now one command:"
echo "  git tag v1.0.2 && git push origin v1.0.2"
dim "The tag must match the version in apps/wallpaper/package.json."
echo
dim "Delete the .p12 you exported — GitHub has it now:"
dim "  rm \"$P12_PATH\""
