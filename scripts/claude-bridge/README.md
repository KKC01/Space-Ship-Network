# Claude Bridge

スマホから GitHub Issue comment 経由で、Desktop の Claude Code に指示を送り、Claude 側の承認要求や実行結果を Issue へ自動投稿する**双方向ブリッジ**。

## 構成

```
スマホ ──(Issue comment)──> GitHub
                              │
                              ▼ (gh ポーリング 30秒)
                          watch.sh (tmux session: watch)
                              │
                              ▼ (tmux send-keys)
                          tmux session: claude
                              │
                              ▼ (VS Code 内で attach)
                          Claude Code UI

  Claude 画面が 45秒間変化なし
        ↓
  パターン判定 → 🟡 承認待ち or ✅ 実行完了
        ↓
  gh issue comment ──> スマホへ通知
```

## 前提

- WSL(Ubuntu/Debian)
- `tmux` / `gh` / `jq` がインストール済み
- `gh auth login` 完了
- ターゲット repo: `KKC01/Space-Ship-Network`
- 監視対象 Issue: label `claude` が付いた **オープン状態の最新 Issue**

## セットアップ

```bash
# 1. スクリプト一式に実行権限付与
chmod +x scripts/claude-bridge/*.sh

# 2. 起動
bash scripts/claude-bridge/startup.sh

# 3. VS Code のターミナルで claude セッションへアタッチ
tmux attach -t claude

# 4. アタッチした tmux 内で claude を起動
claude
```

## 使い方

### スマホ側 (GitHub)

| 投稿内容 | 動作 |
|---|---|
| 通常のテキスト | Claude へ送信 + Enter |
| `#approve` | `y` + Enter を送信 (ツール承認) |
| `#reject` | `n` + Enter を送信 (ツール拒否) |

### WSL 側

| コマンド | 動作 |
|---|---|
| `bash startup.sh` | tmux セッション起動 (watch / claude) |
| `bash stop.sh` | 全セッション停止 |
| `tmux ls` | セッション一覧 |
| `tmux attach -t claude` | Claude UI を表示 (Ctrl+b d でデタッチ) |
| `tmux attach -t watch` | watch.sh ログを表示 |
| `tail -f ~/.local/share/claude-bridge/watch.log` | ログ追跡 |

## 環境変数 (オプション)

| 変数 | デフォルト | 説明 |
|---|---|---|
| `CLAUDE_BRIDGE_REPO` | `KKC01/Space-Ship-Network` | 監視 repo |
| `CLAUDE_BRIDGE_LABEL` | `claude` | 監視 label |
| `CLAUDE_BRIDGE_SESSION` | `claude` | Claude tmux session 名 |
| `CLAUDE_BRIDGE_WATCH_SESSION` | `watch` | watch.sh tmux session 名 |
| `CLAUDE_BRIDGE_POLL_INTERVAL` | `30` | ポーリング間隔 (秒) |
| `CLAUDE_BRIDGE_IDLE_THRESHOLD` | `45` | 画面変化なし閾値 (秒) |
| `CLAUDE_BRIDGE_STATE_DIR` | `~/.local/share/claude-bridge` | 状態ファイル保存先 |

## 注意点

### `@claude` のメンションは自動エスケープされる

リポジトリの GitHub Actions `claude-code-action` が `@claude` を含む comment で発火するため、watch.sh が画面キャプチャを投稿する際は `@claude` → `[at]claude` に置換する。

### Issue が複数ある場合は最新 1 件のみ監視

複数の `claude` ラベル付き Issue がオープン状態にある場合、最も新しい 1 件のみが対象になる。古いやりとりが終わったら Issue をクローズすること。

### 状態ファイル

`~/.local/share/claude-bridge/state.json` に状態が保存される。再起動しても継続するが、リセットしたい場合はこのファイルを削除する。

## トラブルシュート

| 症状 | 対処 |
|---|---|
| watch.sh が応答しない | `tmux attach -t watch` で標準出力を確認 |
| Claude が反応しない | `tmux attach -t claude` で画面状態を確認 |
| Issue へ何度も同じ通知が来る | `state.json` を削除して再起動 |
| 認証エラー | `gh auth status` / `gh auth login` で再認証 |
