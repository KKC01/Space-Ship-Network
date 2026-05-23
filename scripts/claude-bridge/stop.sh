#!/usr/bin/env bash
# tmux セッション (watch / claude) を停止する。
# Claude セッション内のプロセス (claude CLI 等) も終了するので注意。

set -uo pipefail

SESSION_CLAUDE="${CLAUDE_BRIDGE_SESSION:-claude}"
SESSION_WATCH="${CLAUDE_BRIDGE_WATCH_SESSION:-watch}"

for s in "$SESSION_WATCH" "$SESSION_CLAUDE"; do
  if tmux has-session -t "$s" 2>/dev/null; then
    tmux kill-session -t "$s"
    echo "✅ killed: $s"
  else
    echo "ℹ️  not running: $s"
  fi
done
