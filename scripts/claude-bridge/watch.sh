#!/usr/bin/env bash
# GitHub Issue Comment ⇄ Claude Code 双方向ブリッジ
# label: claude が付いた最新 Issue の comment を監視し、
# Claude Code (tmux session) に転送する。
# 逆方向に、Claude の画面停止 (45秒) を検知して Issue へ自動投稿する。

set -uo pipefail

# === 設定 (環境変数で上書き可) ===
REPO="${CLAUDE_BRIDGE_REPO:-KKC01/Space-Ship-Network}"
LABEL="${CLAUDE_BRIDGE_LABEL:-claude}"
SESSION="${CLAUDE_BRIDGE_SESSION:-claude}"
POLL_INTERVAL="${CLAUDE_BRIDGE_POLL_INTERVAL:-30}"
IDLE_THRESHOLD="${CLAUDE_BRIDGE_IDLE_THRESHOLD:-45}"
STATE_DIR="${CLAUDE_BRIDGE_STATE_DIR:-$HOME/.local/share/claude-bridge}"
REPO_DIR="${CLAUDE_BRIDGE_REPO_DIR:-$HOME/Space-Ship-Network}"
PR_BRANCH="${CLAUDE_BRIDGE_PR_BRANCH:-Claude-Code-Desktop}"

LOG_FILE="$STATE_DIR/watch.log"
STATE_FILE="$STATE_DIR/state.json"

mkdir -p "$STATE_DIR"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

# === 依存ツール確認 ===
for cmd in tmux gh jq md5sum; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "✗ missing required command: $cmd"
    exit 1
  fi
done

# === 状態管理 ===
load_state() {
  if [ -f "$STATE_FILE" ]; then
    LAST_COMMENT_ID=$(jq -r '.last_comment_id // ""' "$STATE_FILE")
    LAST_SCREEN_HASH=$(jq -r '.last_screen_hash // ""' "$STATE_FILE")
    LAST_CHANGE_TIME=$(jq -r '.last_change_time // 0' "$STATE_FILE")
    NOTIFIED_HASH=$(jq -r '.notified_hash // ""' "$STATE_FILE")
  else
    LAST_COMMENT_ID=""
    LAST_SCREEN_HASH=""
    LAST_CHANGE_TIME=$(date +%s)
    NOTIFIED_HASH=""
  fi
}

save_state() {
  jq -n \
    --arg cid "$LAST_COMMENT_ID" \
    --arg sh "$LAST_SCREEN_HASH" \
    --argjson ct "$LAST_CHANGE_TIME" \
    --arg nh "$NOTIFIED_HASH" \
    '{last_comment_id: $cid, last_screen_hash: $sh, last_change_time: $ct, notified_hash: $nh}' \
    > "$STATE_FILE"
}

# === tmux 操作 ===
send_to_claude() {
  local body="$1"
  if [ "$body" = "#approve" ] || [ "$body" = "y" ]; then
    tmux send-keys -t "$SESSION" "1" Enter
    log "→ tmux: approved (1)"
  elif [ "$body" = "#reject" ]; then
    tmux send-keys -t "$SESSION" "n" Enter
    log "→ tmux: rejected (n)"
  else
    # -l で literal モード送信 (特殊キー解釈なし)
    tmux send-keys -t "$SESSION" -l -- "$body"
    tmux send-keys -t "$SESSION" Enter
    log "→ tmux: sent body (${#body} chars)"
  fi
}

get_screen() {
  tmux capture-pane -t "$SESSION" -p 2>/dev/null || echo ""
}

hash_screen() {
  printf '%s' "$1" | md5sum | awk '{print $1}'
}

# === GitHub 操作 ===
get_issue() {
  gh issue list --repo "$REPO" --label "$LABEL" --state open --limit 1 \
    --json number --jq '.[0].number // empty' 2>/dev/null
}

get_latest_comment() {
  local issue="$1"
  gh issue view "$issue" --repo "$REPO" --json comments \
    --jq '.comments | last | {id: .id, body: .body}' 2>/dev/null
}

# 投稿本文の @claude 等のメンションを無害化
# (claude-code-action の自動トリガー誤発火を防止)
sanitize_mentions() {
  # @claude / @anthropic-* など、Action がトリガーされ得るメンションを破壊
  sed -E 's/@(claude|anthropic[-_a-z0-9]*)/[at]\1/gi'
}

post_approval_request() {
  local issue="$1"
  local screen_tail="$2"
  local safe_tail
  safe_tail=$(echo "$screen_tail" | sanitize_mentions)
  local body
  body=$(cat <<EOF
## 🟡 承認待ち / 入力待ち

\`\`\`
$safe_tail
\`\`\`

**返信方法:**
- \`#approve\` または \`y\` で承認 (1 を送信)
- \`#reject\` で拒否 (n を送信)
- その他のテキストで自由入力
EOF
  )
  gh issue comment "$issue" --repo "$REPO" --body "$body" >/dev/null
  log "← Issue: posted approval request"
  # 自分の投稿を次のポーリングでスキップするため ID を更新
  LAST_COMMENT_ID=$(get_latest_comment "$issue" | jq -r '.id // ""')
  save_state
}

post_completion() {
  local issue="$1"
  local screen_tail="$2"
  local safe_tail body
  safe_tail=$(echo "$screen_tail" | sanitize_mentions)

  # git 変更確認
  local has_changes=false
  if git -C "$REPO_DIR" status --porcelain 2>/dev/null | grep -q .; then
    has_changes=true
  fi

  if $has_changes; then
    local timestamp pr_url
    timestamp=$(date '+%Y-%m-%d %H:%M')

    # ブランチ作成・コミット・プッシュ
    git -C "$REPO_DIR" checkout -B "$PR_BRANCH" 2>/dev/null
    git -C "$REPO_DIR" add -A
    git -C "$REPO_DIR" commit -m "Claude Code (Desktop): $timestamp" 2>/dev/null
    git -C "$REPO_DIR" push -f origin "$PR_BRANCH" 2>/dev/null

    # 既存 PR 確認 → なければ作成
    pr_url=$(gh pr list --repo "$REPO" --head "$PR_BRANCH" --json url --jq '.[0].url // ""' 2>/dev/null)
    if [ -z "$pr_url" ]; then
      pr_url=$(gh pr create --repo "$REPO" \
        --base main --head "$PR_BRANCH" \
        --title "Claude Code (Desktop): $timestamp" \
        --body "スマホ経由の Claude Code による変更" 2>/dev/null | tail -1)
    fi

    body=$(cat <<EOF
## ✅ 実行完了

\`\`\`
$safe_tail
\`\`\`

PR を作成しました: $pr_url
マージで変更が確定します。
EOF
    )
    log "← Issue: posted completion with PR ($pr_url)"
  else
    body=$(cat <<EOF
## ✅ 実行完了（変更なし）

\`\`\`
$safe_tail
\`\`\`
EOF
    )
    log "← Issue: posted completion (no changes)"
  fi

  gh issue comment "$issue" --repo "$REPO" --body "$body" >/dev/null
  # 自分の投稿を次のポーリングでスキップするため ID を更新
  LAST_COMMENT_ID=$(get_latest_comment "$issue" | jq -r '.id // ""')
  save_state
}

# === 検知パターン ===
# 「処理が止まる」状態のキーワード
is_waiting_for_input() {
  echo "$1" | grep -qE "(Do you want|y/n|y/N|Y/n|Allow|Approve|Continue\?|Proceed\?|Press |❯ [0-9])"
}

# === メインループ ===
main() {
  load_state
  log "watch.sh started (repo=$REPO, label=$LABEL, session=$SESSION, poll=${POLL_INTERVAL}s, idle=${IDLE_THRESHOLD}s)"

  while true; do
    # tmux session 存在確認
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
      log "⚠️ tmux session '$SESSION' not found, waiting ${POLL_INTERVAL}s..."
      sleep "$POLL_INTERVAL"
      continue
    fi

    # --- 入力監視: GitHub → Claude ---
    ISSUE=$(get_issue || echo "")
    if [ -n "$ISSUE" ]; then
      COMMENT_JSON=$(get_latest_comment "$ISSUE" || echo "")
      if [ -n "$COMMENT_JSON" ] && [ "$COMMENT_JSON" != "null" ]; then
        COMMENT_ID=$(echo "$COMMENT_JSON" | jq -r '.id // ""')
        BODY=$(echo "$COMMENT_JSON" | jq -r '.body // ""')

        if [ -n "$COMMENT_ID" ] && [ "$COMMENT_ID" != "$LAST_COMMENT_ID" ]; then
          # 初回起動時 (LAST_COMMENT_ID 空) は反映せず、最新を記録するだけ
          if [ -z "$LAST_COMMENT_ID" ]; then
            log "→ baseline comment: $COMMENT_ID (skipped)"
          else
            log "→ new comment: $COMMENT_ID"
            send_to_claude "$BODY"
            # 送信後はタイマーリセット
            LAST_CHANGE_TIME=$(date +%s)
            NOTIFIED_HASH=""
          fi
          LAST_COMMENT_ID="$COMMENT_ID"
          save_state
        fi
      fi
    fi

    # --- 出力監視: Claude → GitHub ---
    SCREEN=$(get_screen)
    if [ -n "$SCREEN" ]; then
      SCREEN_HASH=$(hash_screen "$SCREEN")
      NOW=$(date +%s)

      if [ "$SCREEN_HASH" = "$LAST_SCREEN_HASH" ]; then
        # 画面変化なし
        ELAPSED=$((NOW - LAST_CHANGE_TIME))

        if [ "$ELAPSED" -ge "$IDLE_THRESHOLD" ] \
            && [ "$NOTIFIED_HASH" != "$SCREEN_HASH" ] \
            && [ -n "$ISSUE" ]; then
          SCREEN_TAIL=$(echo "$SCREEN" | tail -n 30)
          if is_waiting_for_input "$SCREEN"; then
            post_approval_request "$ISSUE" "$SCREEN_TAIL"
          else
            post_completion "$ISSUE" "$SCREEN_TAIL"
          fi
          NOTIFIED_HASH="$SCREEN_HASH"
          save_state
        fi
      else
        # 画面変化あり → タイマーリセット
        LAST_SCREEN_HASH="$SCREEN_HASH"
        LAST_CHANGE_TIME=$NOW
        save_state
      fi
    fi

    sleep "$POLL_INTERVAL"
  done
}

main "$@"
