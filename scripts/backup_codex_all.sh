#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

./scripts/backup_codex_sessions.sh >/dev/null
./scripts/export_codex_transcripts_txt.sh 7 >/dev/null

echo "Codex backups saved to backups/"
