#!/usr/bin/env bash
# tmux セッション (claude / watch) を作成し、watch.sh を起動する。
# 既存セッションがある場合はスキップする (再起動耐性)。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_CLAUDE="${CLAUDE_BRIDGE_SESSION:-claude}"
SESSION_WATCH="${CLAUDE_BRIDGE_WATCH_SESSION:-watch}"

# === 依存ツール確認 ===
for cmd in tmux gh jq md5sum; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "✗ missing: $cmd"
    echo "  以下でインストールしてください (Ubuntu/Debian):"
    echo "  sudo apt-get install -y tmux jq"
    echo "  gh のインストールは: https://github.com/cli/cli#installation"
    exit 1
  fi
done

# === gh 認証確認 ===
if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh が認証されていません。"
  echo "  実行: gh auth login"
  exit 1
fi

# === Claude セッション (受け皿) ===
if tmux has-session -t "$SESSION_CLAUDE" 2>/dev/null; then
  echo "ℹ️  tmux session '$SESSION_CLAUDE' は既に存在します"
else
  tmux new-session -d -s "$SESSION_CLAUDE"
  echo "✅ Created tmux session: $SESSION_CLAUDE"
fi

# === Watch セッション + watch.sh 起動 ===
if tmux has-session -t "$SESSION_WATCH" 2>/dev/null; then
  echo "ℹ️  tmux session '$SESSION_WATCH' は既に存在します"
else
  tmux new-session -d -s "$SESSION_WATCH"
  tmux send-keys -t "$SESSION_WATCH" "bash $SCRIPT_DIR/watch.sh" Enter
  echo "✅ Started watch.sh in session: $SESSION_WATCH"
fi

echo ""
echo "=== tmux sessions ==="
tmux ls
echo ""
echo "次のステップ:"
echo "  1. VS Code のターミナルを開く (Ctrl + \`)"
echo "  2. tmux attach -t $SESSION_CLAUDE"
echo "  3. その中で  claude  を起動"
echo ""
echo "ログ確認:"
echo "  tail -f \$HOME/.local/share/claude-bridge/watch.log"
echo ""
echo "停止:"
echo "  bash $SCRIPT_DIR/stop.sh"
