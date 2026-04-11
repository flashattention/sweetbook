#!/bin/zsh
set -euo pipefail

LABEL="com.sweetbook.dbbackup"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "$PLIST_PATH" ]]; then
	launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
	rm -f "$PLIST_PATH"
	echo "[db:backup:auto] removed: $PLIST_PATH"
else
	echo "[db:backup:auto] not installed"
fi
