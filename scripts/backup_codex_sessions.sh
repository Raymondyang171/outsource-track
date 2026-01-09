#!/usr/bin/env bash
set -euo pipefail

# Repo root（確保從任何路徑執行都能寫到專案 backups）
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/backups/codex_sessions"

# Codex sessions source（只備份 sessions，刻意不碰 auth.json / config 等）
SRC_BASE="$HOME/.codex"
SRC_SESS="$SRC_BASE/sessions"

mkdir -p "$BACKUP_DIR"

if [[ ! -d "$SRC_SESS" ]]; then
  echo "[ERROR] Not found: $SRC_SESS"
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
HOST="$(hostname | tr ' ' '_')"

# 取當下 git 狀態（有助於把對話備份對應到程式碼版本）
cd "$REPO_ROOT"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'N/A')"
GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
GIT_DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

ARCHIVE="$BACKUP_DIR/codex_sessions_${TS}_${HOST}_branch-${GIT_BRANCH}_commit-${GIT_COMMIT}_dirty-${GIT_DIRTY}.tar.gz"
META="$BACKUP_DIR/codex_sessions_${TS}_${HOST}.meta.txt"

# metadata（純文字，可審計）
{
  echo "timestamp=$TS"
  echo "host=$HOST"
  echo "repo=$REPO_ROOT"
  echo "git_branch=$GIT_BRANCH"
  echo "git_commit=$GIT_COMMIT"
  echo "git_dirty_files=$GIT_DIRTY"
  echo "source_sessions=$SRC_SESS"
} > "$META"

# 打包：只打包 ~/.codex/sessions（避免敏感 auth.json）
tar -czf "$ARCHIVE" -C "$HOME" ".codex/sessions"

echo "[OK] Codex sessions archived:"
echo " - $ARCHIVE"
echo "[OK] Metadata saved:"
echo " - $META"

# 可選：保留最近 30 份（避免備份爆長）
KEEP="${KEEP_BACKUPS:-30}"
COUNT="$(ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$COUNT" -gt "$KEEP" ]]; then
  echo "[INFO] Rotating backups: keep last $KEEP, current $COUNT"
  ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n +"$((KEEP+1))" | xargs -r rm -f
  ls -1t "$BACKUP_DIR"/*.meta.txt | tail -n +"$((KEEP+1))" | xargs -r rm -f
fi
