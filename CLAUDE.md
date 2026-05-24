# Space-Ship-Network プロジェクト指示

## セッション開始時の必須手順

新しい会話が始まったら、最初のメッセージ処理前に必ず以下を読む:

1. `/mnt/obsidian/_handoff/current-session.md` — 前回の作業状態・次にやること
2. `/mnt/obsidian/Knowledge/mistakes.md` — ミス再発防止

セッション終了前（作業完了後）に `current-session.md` を更新すること。

**作業が一区切りついたら毎回**、以下を `/mnt/obsidian/_handoff/current-session.md` に書き込む:
- 今何をやったか
- 未解決の問題
- 次のセッションで最初にやること
- 重要な決定事項

## サブエージェント運用ルール

このプロジェクトには `.claude/agents/` に専用エージェントが定義されている。
タスクの性質に応じて以下のエージェントを積極的に活用すること。

### タスク別の推奨エージェント

| タスク | 推奨エージェント |
|---|---|
| ゲームロジック・UI 実装 | `coder` |
| UI / 機能変更後の動作確認 | `tester`（必須） |
| バグ修正・原因特定 | `debugger` |
| 新規アセット登録（src/assets/ 配下） | `asset-loader` |
| コミット前のコードレビュー | `reviewer` |
| API キー・認証情報を扱う変更後 | `security-reviewer`（必須） |

### 必須呼び出しタイミング

以下の場合は**必ず**該当エージェントを呼び出す：

1. **UI / Phaser シーン変更後** → `tester` でブラウザ確認
2. **コミット直前** → `security-reviewer` で認証情報チェック
3. **Dify / Google AI / 外部 API 連携変更後** → `security-reviewer`
4. **新規アセットファイル追加後** → `asset-loader` で preload 登録

### 並列実行の活用

独立したシステム（例: MeteorSystem と ChatWidget）への変更は、
複数のエージェントを並列で呼び出して効率化する。

### 注意

- `coder` で実装 → `tester` で検証 → `reviewer` でレビュー、の流れを基本とする
- バグ発覚時は `tester` → `debugger` に引き継ぐ
- メインの Claude がエージェント呼び出しを忘れた場合、ユーザーが指摘してよい

## ファイル管理ルール

- **プロジェクトルート直下に一時ファイルを作成しない**
- スクリーンショット・テストファイル等の一時ファイルは必ず `Temp/` フォルダ内に作成すること
- `Temp/` フォルダが存在しない場合は作成してから使用する
