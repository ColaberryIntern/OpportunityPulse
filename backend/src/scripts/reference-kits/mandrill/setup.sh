#!/bin/bash
# Mandrill email kit one-shot installer.
#
# Source of truth: Ali Personal BC ticket 9981757450
#   https://app.basecamp.com/3945211/buckets/7463955/todos/9981757450
#
# This script assumes you have already downloaded the kit files from the
# ticket into the SAME directory as this script:
#
#   sendWithBcAttach.js
#   mandrillPreflight.js
#   emailSignature.js
#   check-emdash.sh
#   sample-send.js
#   email-via-mandrill.md  (optional, reference doc)
#   setup.sh               (this file)
#
# Usage:
#   cd /path/to/where/you/extracted/the/kit
#   bash setup.sh /path/to/your/new/project
#
# What it does:
#   1. Verifies you have the kit files in current dir
#   2. Creates backend/src/scripts/lib/ and .claude/hooks/ in your project
#   3. Copies the 4 helper files + 1 sample
#   4. Runs npm install nodemailer in your project's backend if needed
#   5. Prints next steps

set -e

if [ -z "$1" ]; then
  echo "Usage: bash setup.sh /path/to/your/new/project"
  exit 1
fi

DEST="$1"
SRC="$(cd "$(dirname "$0")" && pwd)"

# Verify kit files exist in SRC
for f in sendWithBcAttach.js mandrillPreflight.js emailSignature.js check-emdash.sh sample-send.js; do
  if [ ! -f "$SRC/$f" ]; then
    echo "ERROR: $f not found in $SRC"
    echo "Did you download all the kit files from BC ticket 9981757450 into this directory?"
    exit 1
  fi
done

# Verify DEST exists
if [ ! -d "$DEST" ]; then
  echo "ERROR: destination project does not exist: $DEST"
  exit 1
fi

echo "Installing Mandrill kit into: $DEST"

# Create directories
mkdir -p "$DEST/backend/src/scripts/lib"
mkdir -p "$DEST/.claude/hooks"

# Copy helpers
cp "$SRC/sendWithBcAttach.js"   "$DEST/backend/src/scripts/lib/"
cp "$SRC/mandrillPreflight.js"  "$DEST/backend/src/scripts/lib/"
cp "$SRC/emailSignature.js"     "$DEST/backend/src/scripts/lib/"
cp "$SRC/sample-send.js"        "$DEST/backend/src/scripts/sampleSend.js"
cp "$SRC/check-emdash.sh"       "$DEST/.claude/hooks/"
chmod +x "$DEST/.claude/hooks/check-emdash.sh"

echo "  + backend/src/scripts/lib/sendWithBcAttach.js"
echo "  + backend/src/scripts/lib/mandrillPreflight.js"
echo "  + backend/src/scripts/lib/emailSignature.js"
echo "  + backend/src/scripts/sampleSend.js"
echo "  + .claude/hooks/check-emdash.sh"

# Install nodemailer
if [ -d "$DEST/backend" ] && [ -f "$DEST/backend/package.json" ]; then
  echo ""
  echo "Installing nodemailer in $DEST/backend..."
  (cd "$DEST/backend" && npm install --save nodemailer)
elif [ -f "$DEST/package.json" ]; then
  echo ""
  echo "Installing nodemailer in $DEST..."
  (cd "$DEST" && npm install --save nodemailer)
else
  echo ""
  echo "WARNING: no package.json found. You must install nodemailer manually:"
  echo "  npm install nodemailer"
fi

# Append a hook block to settings.json if it exists
SETTINGS="$DEST/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
  echo ""
  echo "NOTE: .claude/settings.json exists - manually add this hook block:"
  cat <<'JSON_BLOCK'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "pathMatcher": "backend/src/scripts/send.*\\.(js|ts)$",
        "command": ".claude/hooks/check-emdash.sh"
      }
    ]
  }
}
JSON_BLOCK
else
  echo "{
  \"hooks\": {
    \"PostToolUse\": [
      {
        \"matcher\": \"Write|Edit|MultiEdit\",
        \"pathMatcher\": \"backend/src/scripts/send.*\\\\.(js|ts)\$\",
        \"command\": \".claude/hooks/check-emdash.sh\"
      }
    ]
  }
}" > "$SETTINGS"
  echo "  + .claude/settings.json (created with em-dash hook registered)"
fi

echo ""
echo "=== Install complete ==="
echo ""
echo "Next steps:"
echo "  1. Pull credentials from prod:"
echo "       ssh root@95.216.199.47 'docker exec accelerator-backend printenv MANDRILL_API_KEY'"
echo "       ssh root@95.216.199.47 'docker exec accelerator-backend printenv BASECAMP_ACCESS_TOKEN'"
echo ""
echo "  2. Edit $DEST/backend/src/scripts/sampleSend.js:"
echo "       - Replace TICKET_ID with a real BC todo id you own"
echo "       - Replace TO with your own email for first test"
echo ""
echo "  3. Send the smoke test:"
echo "       MANDRILL_API_KEY=\"...\" BASECAMP_ACCESS_TOKEN=\"...\" \\"
echo "         node $DEST/backend/src/scripts/sampleSend.js"
echo ""
echo "  4. If the smoke test arrives in your inbox, the kit is wired correctly."
echo ""
echo "Full reference: https://app.basecamp.com/3945211/buckets/7463955/todos/9981757450"
