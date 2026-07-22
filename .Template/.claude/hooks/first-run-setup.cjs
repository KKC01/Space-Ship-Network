#!/usr/bin/env node
// SessionStart hook: 新規プロジェクトの最初のセッションでのみ、初期設定チェックリストを
// 必ずコンテキストへ注入する。.claude/.setup-done が存在すれば以後は何もしない。
const fs = require("fs");

const MARKER = ".claude/.setup-done";

if (fs.existsSync(MARKER)) {
  process.exit(0);
}

const ctx = `# 【初回セットアップ・必須】新規プロジェクトの初期設定

このプロジェクトは devcontainer テンプレートから展開された直後です。
実装作業を始める前に、AskUserQuestion で以下を1つずつ必ず確認すること（省略しない）。

1. gemini MCP（画像生成）を使いますか？
   - 使う場合: GEMINI_API_KEY の値を直接尋ねてはいけない（認証情報の入力を求める行為は禁止）。
     代わりに「プロジェクトルートの .env に GEMINI_API_KEY=<値> を追記してください」という
     手順を提示し、ユーザー自身に設定してもらう。
   - 使わない場合: .mcp.json と .codex/config.toml から gemini エントリを削除する。

2. Obsidian Vault連携を使いますか？
   - 使う場合: Vaultのホスト側パスを尋ねる（パスは機密情報ではないため直接確認してよい）。
     .devcontainer/.env に OBSIDIAN_VAULT_PATH=<パス> を書き込み、
     docker-compose.yml のマウント行のコメントアウトを外す。
   - 使わない場合: 何もしない（既定で無効のまま）。

3. docs/overview.md（目的・ターゲット・主要機能）を今埋めますか？
   - 埋める場合: 会話で聞き取り、docs/overview.md に書き込む。
   - 後回しにする場合: その旨を確認し、TODOのままで進める。

4. CLAUDE.md の「完了条件（Definition of Done）」の検証コマンドを設定しますか？
   - 設定する場合: 使用する言語・スタックに応じたコマンド（lint/test/build等）を聞き取り、
     CLAUDE.md のTODO枠に書き込む。

5. fusion_ask（OpenRouter Fusion のセカンドオピニオン）を使いますか？
   - 使う場合: OPENROUTER_API_KEY の値を直接尋ねてはいけない。
     「python3 /usr/local/lib/fusion-mcp/server.py --set-key を実行してください」
     という手順を提示する。
   - 使わない場合は何もしなくてよい（未設定でも他機能に影響しない）。

6. Antigravity CLI（agy）を使いますか？
   - 使う場合: 初回ログインが必要な旨を伝える（\`agy\` コマンドでログイン）。
   - 使わない場合は何もしなくてよい。

7. 上記1・2の回答に基づき、使わない MCP サーバー（obsidian/gemini）の定義を
   .mcp.json と .codex/config.toml から削除しますか？

8. 上記で有効にした機能について、実際に呼び出して動作するか確認する（接続可否だけでなく、
   実際の呼び出しまで行う）:
   - playwright: 実際にブラウザナビゲーション等を1回実行して動作確認する（無料）
   - obsidian（有効にした場合）: Vault内のファイル一覧取得や読み込みを1回実行して動作確認する（無料）
   - fusion_ask（有効にした場合）: 実際に1回質問して応答が返るか確認する（実質無料・確認不要で実行してよい）
   - gemini（有効にした場合）: generate_image を実際に1回呼び出して動作確認する。
     **課金が発生する可能性があるため、呼び出し前に必ずユーザーに実行してよいか確認する**
   - agy（有効にした場合）: \`agy --version\` 等の非破壊コマンドで導入状態を確認する（無料）
   - 動作しない機能があれば、原因（APIキー未設定・依存未インストール等）を特定してユーザーに報告する

すべて確認・対応が終わったら、.claude/.setup-done を作成してこのチェックリストを完了とする
（作成後は以後のセッションで再表示されない）。`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: ctx,
    },
  })
);
