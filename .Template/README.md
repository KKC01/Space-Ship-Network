# devcontainer-template

Claude Code / Antigravity CLI（`agy`）/ Fusion MCP（`fusion_ask`）と、Loop Engineering型の
`CLAUDE.md` 骨格をあらかじめ組み込んだ、プロジェクト横断で使い回すための devcontainer 基盤テンプレート。

## 含まれるもの
- **Claude Code CLI**: Dockerfileでグローバルインストール済み
- **Antigravity CLI（agy）**: Dockerfileで導入し、`agy-config` という name 固定の共有 Docker volume
  （`/root/.gemini` にマウント）でログイン状態を全プロジェクト間で共有する
- **Fusion MCP（fusion_ask）**: `postCreateCommand` で `fusion-install.sh` が自動導入・登録する、
  OpenRouterの無料モデル合議によるセカンドオピニオンツール
- **Claude Code の状態共有**: `devcontainer.json` の `mounts` でホストの実際の `~/.claude`
  （Windows: `${localEnv:USERPROFILE}\.claude`）を `/root/.claude` にバインドマウントする。
  ユーザーレベルの設定・グローバルCLAUDE.md・hooks（rtk等）・memoryを全プロジェクトで共有する
- **dotfiles/**: VS Code の `dotfiles.repository` 機構経由で agy を自動導入する仕組み一式
  （単体でも別リポジトリとして使える）
- **`CLAUDE.md`**: Loop Engineering型の骨格（Maker-Checker・Skills・Durable State・Automations/Trigger・
  Worktrees・Plugins/MCPへのポインタ、完了条件のTODO枠）。**どう開発を進めるか**（プロセス）を定義する
- **`docs/overview.md`**: **何を・なぜ作るか**（目的・ターゲット・主要機能、プロジェクト全体・永続的）を
  書くTODO枠。新規プロジェクトで最初に埋める
- **`docs/tasks/`**: 個別の機能・作業に取り掛かるたびに1ファイル作成する作業単位のドキュメント
  （`[YYYYMMDD]-[作業タイトル].md`、フォーマットは `docs/tasks/README.md` 参照）
- **`AGENTS.md` / `AI_SYNC.md`**: Codex CLI 向けの入口と、Claude Code側との同期ルール
- **`.mcp.json`**: `playwright`（ブラウザ操作、APIキー不要）・`obsidian`（Obsidian Vault連携）・
  `gemini`（画像生成）の3 MCPサーバーを定義済み
- **`.claude/`**: `settings.json`（`block-sensitive-files.sh` フックで `settings.local.json` を保護、
  Obsidian連携用の `SessionStart`/`Stop` フック）、汎用サブエージェント（`reviewer`・`security-reviewer`・
  `debugger`）、スラッシュコマンド（`grill-me`）、Skill（`obsidian-skills`・`ui-check`）を同梱
- **`.codex/`**: `.claude/` に対応するCodex CLI側のミラー（`agents/*.toml`・`hooks/`・`config.toml`）

## 使い方

### A. 新規プロジェクト（何もない状態）から始める場合
1. `.Template` の中身をそのまま新しいフォルダに展開し、そのフォルダをdevcontainerとして開く。
   `postCreateCommand`（`fusion-install.sh` + `.devcontainer/mcp` の `npm install`）が自動実行され、
   Claude Code / MCP / hooks / agents はすぐ使える状態になる
2. Claude Codeでの最初のセッション開始時、`.claude/hooks/first-run-setup.cjs` が初期設定チェックリストを
   自動でコンテキストへ注入する。Claudeが以下をAskUserQuestionで1つずつ確認する
   （`.claude/.setup-done` が作成されるまで、以後も毎回このチェックリストが再表示される）:
   - `gemini` MCP（画像生成）を使うか（使う場合、APIキーは提示された手順でユーザー自身が `.env` に設定する。
     Claudeがキーの値を直接尋ねることはない）
   - Obsidian Vault連携を使うか（使う場合、Vaultのホスト側パスを確認）
   - `docs/overview.md`（目的・ターゲット・主要機能）を今埋めるか
   - `CLAUDE.md` の完了条件（Definition of Done）の検証コマンドを設定するか
   - `fusion_ask`・Antigravity（`agy`）を使うか
   - 使わない MCP サーバー定義を削除するか
   - 有効にした機能を実際に1回呼び出して動作確認する（課金が発生し得る呼び出し［gemini画像生成等］は
     事前にユーザー承認を得てから実行する）
   - Obsidian Vaultが空の場合、`Knowledge`/`Decisions`/`Projects`/`Preferences` フォルダは
     `obsidian-session-context.cjs` が自動作成する（手動セットアップ不要）
3. 個別の機能・作業に取り掛かる際は `docs/tasks/[YYYYMMDD]-[作業タイトル].md` を1ファイル作成する
   （要求・設計・タスクリストをまとめる。フォーマットは `docs/tasks/README.md` 参照。セクションごとの人間承認ゲートは設けない）
4. 実装を開始する（`CLAUDE.md` のMaker-Checkerループに従う）

`/init` の実行は必須ではない。ソースコードを追加した後に `/init` を使う場合は、`CLAUDE.md` の
Loop Engineering骨格（Maker-Checker・Durable State等のポインタ部分）を上書きしないか確認してから反映すること。

### B. 既存プロジェクトに後付けする場合
```bash
# 既存プロジェクトのルートで
git clone https://github.com/<あなた>/devcontainer-template.git .devcontainer-tmp
cp -r .devcontainer-tmp/.devcontainer .
cp -r .devcontainer-tmp/.claude .
cp -r .devcontainer-tmp/.codex .
cp .devcontainer-tmp/.mcp.json .
cp .devcontainer-tmp/CLAUDE.md .
cp .devcontainer-tmp/AGENTS.md .
cp .devcontainer-tmp/AI_SYNC.md .
cp -r .devcontainer-tmp/docs .
cp -r .devcontainer-tmp/dotfiles .   # 任意（dotfiles機構を使わないなら省略可）
rm -rf .devcontainer-tmp
```

### 共通: プロジェクト固有の設定を追記する
- `Dockerfile` の末尾コメント部分に、そのプロジェクトで必要な apt/pip パッケージを追加
- `docker-compose.yml` に、プロジェクトが依存する追加サービス（DB・外部エンジンなど）を追記し、
  `depends_on` で `app` サービスに紐付ける
- 必要な `forwardPorts` を `devcontainer.json` に追加
- `CLAUDE.md` の「完了条件（Definition of Done）」TODO枠に、このプロジェクトの検証コマンドを記載する
- 使わない MCP サーバー（`obsidian`・`gemini`）は `.mcp.json` と `.codex/config.toml` から削除してよい

### `.env` の配置場所（2種類・混同注意）
このテンプレートでは **2つの異なる `.env`** を使う。場所を間違えるとVaultマウントやAPIキーが効かない。

| 用途 | 配置場所 | 読み込み元 |
|---|---|---|
| `OBSIDIAN_VAULT_PATH`（Obsidian Vaultのホスト側パス） | **`.devcontainer/.env`**（`docker-compose.yml`と同じ階層） | Docker Compose がホスト側でのみ解決する。コンテナ内には伝播しない |
| `GEMINI_API_KEY`（gemini MCPサーバー用） | **プロジェクトルートの `.env`** | `node --env-file=.env`（geminiサーバー起動時、cwd=プロジェクトルート） |

**注意**: `GEMINI_API_KEY` が未設定の場合、`gemini` MCPサーバーは起動直後に `exit(1)` して終了する
（`.mcp.json` に定義はあるが、Claude Codeのツール一覧に `mcp__gemini__*` が一切出てこない状態になる）。
「動かない」ではなく「そもそも起動していない」ので、ツール一覧に出ない場合はまず `.env` の設定を確認する。
`gemini` を使わないプロジェクトでは `.mcp.json` からこのサーバー定義を削除してよい。

Obsidian Vaultを使う場合の手順:
1. `.devcontainer/.env` に `OBSIDIAN_VAULT_PATH=/path/to/vault` を設定する
2. `docker-compose.yml` の `- ${OBSIDIAN_VAULT_PATH}:/mnt/obsidian:cached` の行のコメントアウトを外す
3. コンテナ内部では常に固定パス `/mnt/obsidian` にマウントされる（`.mcp.json`・hooksはこの固定パスを直接参照している）

Vaultをマウントしない場合（既定）でも、Claude Code自体やplaywright/geminiの起動は妨げられない。
`obsidian` MCPツールを実際に呼び出した時にのみエラーになるだけで、SessionStart/Stopフックも
`/mnt/obsidian` が存在しない場合は何も出力しない。

### （任意）dotfiles を使って agy を全devcontainerに自動導入する
一度だけのセットアップで、以後どのdevcontainerでも `agy` が自動的に入るようになる。
手順は [`dotfiles/README.md`](dotfiles/README.md) を参照。

### agy の認証共有ボリュームを有効化する
`docker-compose.yml` には既に `agy-config` 共有ボリュームの設定が入っている。
dotfilesを使わずDockerfileでagyを直接導入する構成（このテンプレートの既定）でも、
一度ログインすれば以後の再構築でログイン状態が引き継がれる。

## 含まれないもの（プロジェクトごとに追加する）
このテンプレートは基盤のみを提供する。以下はプロジェクトの性質に応じて個別に追加すること:
- 言語ランタイム固有の追加パッケージ（ffmpeg、画像処理ライブラリ等）
- 外部API連携用の認証情報・SDK（YouTube API、各種クラウドSDK等）
- プロジェクト固有の依存サービス（DB、外部エンジンのコンテナ等）
- Obsidian Vaultの実パス設定（`.devcontainer/.env` の `OBSIDIAN_VAULT_PATH`）はプロジェクトごとに行う
- 汎用的なLoop Engineering骨格は `CLAUDE.md` に同梱済み。プロジェクト固有のSOP・Maker役サブエージェント
  （coder/tester等）・完了条件のTODO記入はプロジェクトごとに追加する
