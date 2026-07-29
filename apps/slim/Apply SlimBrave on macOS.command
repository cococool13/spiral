#!/bin/zsh

set -u

SCRIPT_DIR=${0:A:h}
SLIMBRAVE_SCRIPT="$SCRIPT_DIR/slimbrave-mac.py"
PRESET="$SCRIPT_DIR/Presets/Maximum Performance and Privacy Preset.json"

clear
print "SlimBrave Neo — Maximum Performance + Privacy"
print ""

if [[ "$(uname -s)" != "Darwin" ]]; then
    print -u2 "This launcher only runs on macOS."
    read -k 1 "?Press any key to close."
    exit 1
fi

if [[ ! -f "$SLIMBRAVE_SCRIPT" || ! -f "$PRESET" ]]; then
    print -u2 "SlimBrave files are incomplete. Keep this launcher inside the repository folder."
    read -k 1 "?Press any key to close."
    exit 1
fi

PYTHON_BIN=$(command -v python3 2>/dev/null)
if [[ -z "$PYTHON_BIN" ]]; then
    print -u2 "Python 3 is required. Install Python 3, then run this launcher again."
    read -k 1 "?Press any key to close."
    exit 1
fi

print "This applies a readable Brave enterprise policy to every installed Brave channel."
print "It keeps Safe Browsing, QUIC, hardware acceleration, and automatic secure DNS available."
print "macOS will ask for your password and then require one approval in Device Management."
print ""

if ! "$PYTHON_BIN" "$SLIMBRAVE_SCRIPT" \
    --preview "$PRESET" \
    --channels auto \
    --persist on; then
    print ""
    print -u2 "The safety preview failed. No changes were made."
    read -k 1 "?Press any key to close."
    exit 1
fi
print ""

if ! read -q "REPLY?Apply the profile now? [y/N] "; then
    print ""
    print "No changes made."
    exit 0
fi
print ""

if sudo "$PYTHON_BIN" "$SLIMBRAVE_SCRIPT" \
    --import "$PRESET" \
    --channels auto \
    --persist on; then
    print ""
    print "Profile prepared. Finish the install in:"
    print "System Settings > General > Device Management"
    print ""
    print "Then fully quit and reopen Brave and check brave://policy."
    print "To undo it later, run: sudo \"$PYTHON_BIN\" \"$SLIMBRAVE_SCRIPT\" --reset"
else
    status=$?
    print ""
    print -u2 "Durable profile setup did not complete. Read the error above; a plist fallback may still be active."
    read -k 1 "?Press any key to close."
    exit $status
fi

read -k 1 "?Press any key to close."
