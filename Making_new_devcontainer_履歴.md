# devcontainer テンプレート作成 履歴

`.Template`（`/workspaces/Space-Ship-Network/.Template`）を、他プロジェクトでも使い回せる汎用
devcontainerテンプレートとして構築した作業の記録。本体プロジェクト（Space-Ship-Network）自体には
変更を加えていない。作業対象はすべて `.Template` 配下と、ユーザーレベル `~/.claude/` の一部。

## 1. 背景・目的

現在のプロジェクトで使っている MCP・Skill・Claude拡張・VSCode拡張・devcontainer構成を、新規プロジェクト
作成時にも使えるようにテンプレート化したい、という要望から開始。テンプレート自体は既に一部
（Claude Code CLI・Fusion MCP・Antigravity CLI・状態永続化・dotfiles機構）が用意されていたため、
そこに以下を1つずつ確認しながら追加した。

## 2. MCP（`.mcp.json`）

| サーバー | 方針 |
|---|---|
| `playwright` | そのまま同梱（APIキー不要・汎用） |
| `magic`（21st.dev） | 含めない（`TWENTY_FIRST_API_KEY`必須、必要なプロジェクトのみ個別追加） |
| `obsidian` | 汎用化して同梱。当初 `${OBSIDIAN_VAULT_PATH}` という変数参照にしていたが、後述の再検証で
  コンテナ内部からは参照不可能と判明し、固定パス `/mnt/obsidian` に修正 |
| `gemini`（画像生成） | `gemini-image-mcp.js` を `.devcontainer/mcp/` にコピーして同梱。依存パッケージ
  （`canvas`・`@google/genai`）用の `package.json` を新設 |

## 3. Skill・Claude拡張

- `.claude/skills/obsidian-skills`（kepano氏のプラグイン形式）・`ui-check` を同梱
- `.claude/agents/{reviewer,security-reviewer,debugger}.md` を汎用化して同梱（Phaser/ゲーム固有記述を除去）。
  `coder`・`tester`・`asset-loader`等はゲーム開発前提が強いため含めない
- `.claude/commands/grill-me.md` をそのまま同梱
- `.claude/hooks/block-sensitive-files.sh`（`settings.local.json` 保護）を同梱

## 4. VSCode拡張

- 日本語言語パック（`MS-CEINTL.vscode-language-pack-ja`）を追加
- ESLint/Prettier/TypeScript拡張は言語不一致のため含めない（Pythonベーステンプレートのため）

## 5. Loop Engineering型 CLAUDE.md の導入

現行の逐次確認型ガードレールに代えて、2026年に登場した **Loop Engineering**
（Boris Cherny/Addy Osmani らが提唱、"prompt engineering" から "designing the loop" への転換）の
考え方をテンプレート側の基本方針として採用。6要素（Automations/Trigger・Worktrees・Skills・
Plugins/MCP・Maker-Checker Subagents・Durable State）を `CLAUDE.md` に反映した。

`CLAUDE.md` は「地図」に徹する設計とし、詳細手順は書かず「何がどこにあるか」のポインタのみ記載。

- **Maker → Checker のループ**: 実装(Maker) → reviewer/security-reviewer(Checker) →
  debugger（最小修正）
- **Durable State**: Obsidian `Knowledge/mistakes.md` を正本、Claude Codeの自動memory機能は補完役
- **完了条件（Definition of Done）**: 検証コマンドのTODO枠。人間の都度承認ではなく機械的判定で止まる
- **Human-in-the-loopエスカレーション**: 破壊的操作等はユーザーレベルCLAUDE.mdのルールに従う（重複定義しない）

### 5-1. AGENTS.md / AI_SYNC.md / .codex/ の汎用化

Codex CLI 側の入口（`AGENTS.md`）・Claude Codeとの同期ルール（`AI_SYNC.md`）・
`.codex/agents/*.toml`・`.codex/hooks/`・`.codex/config.toml` を汎用化して同梱。

## 6. 再検証で判明した設計ミスと修正

ユーザーからの複数回の「念入りな再確認」指示により、以下の実害あるバグを事前に発見・修正した。

1. **`.mcp.json` のパース失敗バグ**: `${OBSIDIAN_VAULT_PATH}` にデフォルト値がなく、未設定時に
   `.mcp.json` 全体のパースに失敗する（playwright・geminiも含め全MCPが起動しなくなる）ことが判明。
2. **`OBSIDIAN_VAULT_PATH` はコンテナ内部から見えない**: `docker-compose.yml` の
   `${OBSIDIAN_VAULT_PATH}:/mnt/obsidian` はホスト側のマウント元だけが変数で、コンテナ内側は常に
   固定パス `/mnt/obsidian`。`environment:`/`env_file:` の指定が無いため、コンテナ内のClaude Code /
   Node からはこの変数を参照できない。`.mcp.json`・hookスクリプトは固定パス直書きに修正した。
3. **`.env` ファイルの配置場所が2種類に分かれる罠**: `OBSIDIAN_VAULT_PATH` は `.devcontainer/.env`
   （Docker Composeがホスト側でのみ解決）、`GEMINI_API_KEY` はプロジェクトルートの `.env`
   （`node --env-file=.env`）。混同すると設定が効かない。README に明記。
4. **`fusion-install.sh` への対話プロンプト追加を撤回**: 当初Obsidian Vaultパスの対話入力を検討したが、
   同スクリプトが完全非対話設計であり、Antigravity/Codex/CI等の非TTY環境でハングするリスクが判明したため撤回。
5. **`.codex/hooks.json` のWindows絶対パスハードコード**: `C:\Users\kench\...` という実行環境固有の
   絶対パスが残っており、Linux devcontainer・テンプレートでは機能しない。相対パスに修正。
6. **`.codex/config.toml` の構成ズレ**: `magic`・`aidesigner` サーバーが残っていたが、Claude側
   `.mcp.json` では除外済みのため、Codex側も揃えて削除。
7. **`.claude` マウント方式の見落とし**: `docker-compose.yml` が `/root/.claude` を名前付きボリューム
   （プロジェクトごとに分離・空の状態から開始）にマウントしていたため、ユーザーレベルの
   `~/.claude/settings.json`（rtkフック等）・グローバル`CLAUDE.md`が一切引き継がれないことが判明。
   本体プロジェクトと同じ `devcontainer.json` の `mounts` によるホスト `~/.claude` の
   バインドマウントに変更。
8. **`.devcontainer/mcp/` の `npm install` 漏れ**: 実際にテンプレートを展開して動作確認した結果、
   `canvas`・`@google/genai` の依存インストールが `postCreateCommand` に組み込まれておらず、
   gemini MCPサーバーが `ERR_MODULE_NOT_FOUND` で起動しないことが判明。
   `postCreateCommand` に `npm install --prefix .devcontainer/mcp` を追加して自動化した。

## 7. プロジェクトの目的・仕様を定義する場所の追加

Loop Engineeringは「どう進めるか」のプロセス定義であり、「何を・なぜ作るか」を定義する場所が
無かったため、以下を追加した（元々あった `元 CLAUDE.md` の `docs/` + `.steering/` 構成に一部寄せた
簡易版）。

- **`docs/overview.md`**: プロジェクト全体・永続的な「目的・ターゲット・主要機能」を書くTODO枠
- **`docs/tasks/[YYYYMMDD]-[作業タイトル].md`**: 個別の機能・作業単位で1ファイル作成
  （要求・設計・タスクリストをまとめる。フォーマットは `docs/tasks/README.md` に記載）
  - 元CLAUDE.mdにあった「各パート作成後に人間の承認を得て次に進む」というゲート型プロセスは
    **導入していない**（Loop Engineeringの、完了条件による機械的判定を優先する方針を維持）

## 8. 初回セットアップの自動チェックリスト

新規プロジェクトの最初のセッションで、以下7項目を必ずAskUserQuestionで確認させるための
`.claude/hooks/first-run-setup.cjs`（SessionStartフック）を新設した。
`.claude/.setup-done` が存在しない限り毎回発火し、対応完了後にこのマーカーファイルを作成する運用。

1. `gemini` MCP（画像生成）を使うか
2. Obsidian Vault連携を使うか
3. `docs/overview.md` を今埋めるか
4. `CLAUDE.md` の完了条件（Definition of Done）を設定するか
5. `fusion_ask` を使うか
6. Antigravity CLI（`agy`）を使うか
7. 使わないMCPサーバー定義を削除するか

**認証情報（`GEMINI_API_KEY`・`OPENROUTER_API_KEY`）は、AskUserQuestionで値を直接尋ねることはしない**
（ユーザーレベルCLAUDE.mdのルール8「認証情報の入力を求めてはいけない」に従う）。使うかどうかの意思
確認のみ行い、使う場合は設定手順（コマンド・記載場所）を提示するだけにとどめる。Obsidian Vaultの
ホスト側パスは機密情報ではないため、直接確認してよい。

## 9. ユーザーレベル `~/.claude/CLAUDE.md` の構造整理

今回の精査で判明した重複・レイヤー混在（Obsidian連携ルールの内容が、プロジェクト側の設計と
重複気味だった点）を解消するため、ユーザー確認の上で以下を実施した。

- `~/.claude/CLAUDE.md` 内の「Obsidian 連携ルール」セクション（全7項目）を `~/.claude/Obsidian.md`
  に切り出した
- `~/.claude/CLAUDE.md` 側は `@Obsidian.md` の1行参照に置き換えた（既存の `@RTK.md` と同じ
  インクルード方式）
- 前半「行動ルール1-13」と後半「コーディング時の一般的なミスを減らすための行動指針1-4」の
  2層構造自体は変更していない（メタルールとコーディング判断指針という異なる抽象度のため）

## 10. 動作検証で発覚した実際の不具合（テンプレート展開後の実機テスト）

`.Template` を実際に新規プロジェクトとして展開し devcontainer を起動した検証で、上記6-8の
`npm install` 漏れが実際に再現し `ERR_MODULE_NOT_FOUND` で `gemini` MCPが起動しないことを確認。
また `fusion_ask` も `OPENROUTER_API_KEY` 未設定でエラーになることを確認（これは想定通りの挙動で、
ユーザーが各自のキーを設定する運用のため不具合ではない）。前者はテンプレート側の実装漏れとして
`postCreateCommand` に修正を反映した。

## 11. 初回セットアップの自動チェック強化（Obsidian初期化・Chrome導入・機能動作確認）

`.Template` を実際に別環境（Obsidian Vaultパスに `TEST_1` を指定）にデプロイして検証したところ、
以下2点の指示・改善要望が出たため反映した。

### 11-1. Obsidian Vaultが空の場合の自動初期化

指定したVaultフォルダが空（新規Vault）だと、`Knowledge`/`Decisions`/`Projects`/`Preferences` の
フォルダ構造が存在せず、`mistakes.md` も読めない状態になっていた。ユーザーレベル `~/.claude/Obsidian.md`
の「0. 初期セットアップ」はLLMが手動で実行する前提の手順だったが、これはLLMの判断に依存させず
機械的に実行すべき処理と判断し、`.claude/hooks/obsidian-session-context.cjs` に
「`/mnt/obsidian` が空なら上記4フォルダと `Knowledge/mistakes.md` を自動作成する」処理を追加した。

### 11-2. Google Chromeの自動インストール

`.Template/.devcontainer/Dockerfile` にはPlaywright MCPが必要とするChromeのインストール手順が
無かった（本体 `Space-Ship-Network` の `Dockerfile` には元々あった）。同じ手順
（`google-chrome-stable` の apt インストール）をテンプレート基盤側に追加した。

### 11-3. 初回セットアップ時の実際の動作確認

`.claude/hooks/first-run-setup.cjs` のチェックリストに、有効化した機能を**実際に呼び出して**
動作確認する項目（8番目）を追加した。playwright・obsidian・fusion_ask・agy は無料範囲のため
確認なしで実行してよいが、gemini の画像生成（`generate_image`）は課金の可能性があるため、
呼び出し前に必ずユーザー承認を得る設計とした（ユーザーレベルCLAUDE.mdの「破壊的操作の前に確認する」
「認証情報の入力を求めてはいけない」ルールと整合させた）。

## 最終的な変更対象

- `.Template/` 配下: `.mcp.json`・`.claude/`・`.codex/`・`CLAUDE.md`・`AGENTS.md`・`AI_SYNC.md`・
  `docs/`・`README.md`・`.devcontainer/`（`devcontainer.json`・`docker-compose.yml`・`Dockerfile`）
- `~/.claude/CLAUDE.md`・`~/.claude/Obsidian.md`（新規）

本体プロジェクト（`Space-Ship-Network`）の既存ファイルには、作業全体を通じて一切変更を加えていない。
