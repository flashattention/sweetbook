#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
if [[ -z "${NODE_BIN}" ]]; then
	echo "[db:backup:auto] node not found" >&2
	exit 1
fi

LABEL="com.sweetbook.dbbackup"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/${LABEL}.plist"
LOG_DIR="$ROOT_DIR/prisma/backups"
mkdir -p "$PLIST_DIR" "$LOG_DIR"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>WorkingDirectory</key>
	<string>${ROOT_DIR}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${NODE_BIN}</string>
		<string>${ROOT_DIR}/scripts/backup-db.js</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>DB_BACKUP_KEEP_COUNT</key>
		<string>60</string>
	</dict>
	<key>StartInterval</key>
	<integer>900</integer>
	<key>RunAtLoad</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${LOG_DIR}/launchd.out.log</string>
	<key>StandardErrorPath</key>
	<string>${LOG_DIR}/launchd.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"

echo "[db:backup:auto] installed: $PLIST_PATH"
echo "[db:backup:auto] interval: 900s (15m), keep: 60 files"
