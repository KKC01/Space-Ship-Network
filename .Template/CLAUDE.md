# CLAUDE.md（Loop Engineering 骨格）

このファイルは詳細手順を書き込む場所ではない。「何がどこにあるか」の地図として使い、実体は各ファイルに置く。
このファイルは**どう開発を進めるか**（プロセス）を定義する。**何を・なぜ作るか**は [docs/overview.md](docs/overview.md) を参照（新規プロジェクトでは最初に埋める）。

**新規プロジェクトの最初のセッションでは、`.claude/hooks/first-run-setup.cjs` が初期設定チェックリスト
（MCP利用・Obsidian連携・overview記入・完了条件設定・fusion_ask/agy利用・有効化した機能の実際の動作確認等）
を必ずコンテキストへ注入する。`.claude/.setup-done` が無い限り毎回発火するので、対応後は必ずこの
マーカーファイルを作成すること。課金の可能性がある呼び出し（gemini画像生成等）は事前にユーザー承認を得る。**

## Maker → Checker のループ

- **Maker**: 実装を行う（通常のセッション、またはプロジェクトごとに追加する専用サブエージェント）
- **Checker**: `.claude/agents/reviewer.md`（品質）・`.claude/agents/security-reviewer.md`（セキュリティ）が検証する
- Checkerが指摘した問題は `.claude/agents/debugger.md` が最小修正で解消する
- コミット前に **必ず** reviewer と security-reviewer を呼ぶ

## 作業単位のファイル（docs/tasks/）

個別の機能・作業に取り掛かるたびに `docs/tasks/[YYYYMMDD]-[作業タイトル].md` を1ファイル作成する
（要求・設計・タスクリストをまとめる。フォーマットは [docs/tasks/README.md](docs/tasks/README.md) 参照）。
`docs/overview.md`（プロジェクト全体・永続的）とは別物。セクションごとの人間承認ゲートは設けない
（完了条件で機械的に判定する Loop Engineering 方針を優先する）。

## Skills（繰り返し作業の外部化）

同じ手順を2回書くなら `.claude/skills/` に SKILL.md として外部化する。プロンプトに手順を書き込み直さない。

## Durable State（記憶の場所）

- 恒久的な知見・ミスの記録は **Obsidian** `Knowledge/mistakes.md` を正本とする（`.claude/hooks/obsidian-session-context.cjs` が毎セッション自動で読み込む。マウントされていない場合は何もしない）
- Claude Code の自動 memory 機能は補完役（Obsidianを持たないプロジェクトではこちらが正本になる）
- セットアップ方法は [README.md](README.md) を参照

## Automations / Trigger

繰り返し作業・監視作業は Claude Code の `/loop` を使う。都度プロンプトを書き直さない。

## Worktrees

複数の独立した変更を並列で進める場合は、git worktree で作業ツリーを分離する。同一ツリーでの並列サブエージェント実行は避ける。

## Plugins / MCP

利用可能な外部ツールは `.mcp.json` に定義済み（playwright / obsidian / gemini）。用途は各サーバー名の通り。使わないサーバーは削除してよい。

## 完了条件（Definition of Done）

<!-- TODO: このプロジェクトの検証コマンド（テスト・ビルド・lint等）を記載する -->

検証コマンドが通ることを完了条件とする。人間の都度承認ではなく、機械的に判定可能な条件で止まる。

## 破壊的操作・確認が必要な場面

ファイル削除・force push・commit/pushの実行判断は、ユーザーレベル `CLAUDE.md` のルールに従う（このファイルでは重複定義しない）。
