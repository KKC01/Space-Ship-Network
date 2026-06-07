# Space-Ship-Network

このリポジトリでは Claude Code をメインに使う。

## セッション開始時の必須手順

新しい会話が始まったら、最初のメッセージ処理前に必ず以下を読む:

1. `/mnt/obsidian/_handoff/current-session.md` - 前回の作業状態・次にやること
2. `/mnt/obsidian/Knowledge/mistakes.md` - ミス再発防止（必須）

セッション終了前、または作業が一区切りついたら `current-session.md` を更新すること。

## このリポジトリの指示

- 変更は最小限にする。
- 不要なリファクタリングはしない。
- 役割の違う設定は混ぜない。
- 変更後は Obsidian に引き継ぎを書く。（必須）
- セキュリティに関わる変更は既存の hook と確認ルールに従う。（必須）

## サブエージェント運用ルール

このプロジェクトには `.claude/agents/` に専用エージェントが定義されている。
タスクの性質に応じて以下のエージェントを積極的に活用すること。

### タスク別の推奨エージェント

| タスク                               | 推奨エージェント            |
| ------------------------------------ | --------------------------- |
| ゲームロジック・UI 実装              | `coder`                     |
| UI / 機能変更後の動作確認            | `tester`（必須）            |
| バグ修正・原因特定                   | `debugger`                  |
| 新規アセット登録（src/assets/ 配下） | `asset-loader`              |
| コミット前のコードレビュー           | `reviewer`                  |
| API キー・認証情報を扱う変更後       | `security-reviewer`（必須） |

### 必須呼び出しタイミング

以下の場合は**必ず**該当エージェントを呼び出す：

1. **UI / Phaser シーン変更後** -> `tester` でブラウザ確認
2. **コミット直前** -> `security-reviewer` で認証情報チェック
3. **Dify / Google AI / 外部 API 連携変更後** -> `security-reviewer`
4. **新規アセットファイル追加後** -> `asset-loader` で preload 登録

### 並列実行の活用

独立したシステム（例: MeteorSystem と ChatWidget）への変更は、
複数のエージェントを並列で呼び出して効率化する。

### 注意

- `coder` で実装 -> `tester` で検証 -> `reviewer` でレビュー、の流れを基本とする
- バグ発覚時は `tester` -> `debugger` に引き継ぐ

## ファイル管理ルール

- **プロジェクトルート直下に一時ファイルを作成しない**
- スクリーンショット・テストファイル等の一時ファイルは必ず `Temp/` フォルダ内に作成すること

## 主要な対応関係

| 役割     | Claude Code 側    | Codex 側             |
| -------- | ----------------- | -------------------- |
| 常時指示 | `CLAUDE.md`       | `AGENTS.md`          |
| MCP 設定 | `.mcp.json`       | `.codex/config.toml` |
| Hooks    | `.claude/hooks/`  | `.codex/hooks/`      |
| Agents   | `.claude/agents/` | `.codex/agents/`     |
| Skills   | `.claude/skills/` | `.codex/skills/`     |
