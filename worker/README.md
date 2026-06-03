# 案2a: Cloudflare Worker で Dify チャットを本番(GitHub Pages)から使う手順

公開URL（GitHub Pages）でチャットを動かすため、Dify への中継を Cloudflare Worker に置く。
Dify の API キーは Worker のシークレットにのみ保存し、クライアント・リポジトリには置かない。

## 構成
ブラウザ(GitHub Pages) → Cloudflare Worker(キー保持) → Dify API

## 0. 必要なもの
- Cloudflare 無料アカウント（クレジットカード不要）
- Node.js（インストール済み）

## 1. Cloudflare アカウント作成
- 登録URL: https://dash.cloudflare.com/sign-up
- メールアドレスとパスワードで登録（カード不要・無料枠 約10万req/日）

## 2. Worker をデプロイ（このリポジトリの worker/ で実行）
```bash
cd worker
npx wrangler login                 # ブラウザが開き Cloudflare にログイン認証（1回）
npx wrangler secret put DIFY_API_KEY   # プロンプトに Dify のキーを貼り付け（端末入力・暗号化保存）
npx wrangler deploy                # デプロイ。完了後に Worker の URL が表示される
```
表示される URL 例: `https://space-ship-dify.<あなたのサブドメイン>.workers.dev`
→ この URL を控える（公開URLなので秘密ではない）。

## 3. フロントの送信先を Worker に向ける（担当: Claude）
`src/services/DifyChat.ts` の送信先を環境で切替える（開発はローカルのまま）:
```ts
const DIFY_ENDPOINT = import.meta.env.PROD
  ? 'https://space-ship-dify.<あなたのサブドメイン>.workers.dev' // 本番=Worker
  : '/api/dify-chat';                                            // 開発=Viteプロキシ(server.js)
// fetch('/api/dify-chat', ...) → fetch(DIFY_ENDPOINT, ...)
```
※ Worker URL は秘密ではないのでクライアントに入れてよい。Dify キーは Worker 側のみ。

## 4. 反映
- security-reviewer を通す → コミット＆ GitHub Pages へデプロイ（ユーザーの明示許可後）。

## 動作確認
- スマホ等から公開URL → チャット送信 → 応答が返ればOK。
- ローカル開発は従来どおり `npm run dev` + `npm run server`。

## 鍵の取り扱い
- キーは `wrangler secret` のみ。`worker.js`・`wrangler.toml`・git・クライアントには絶対に書かない。
- 変更が漏洩経路を作らないか、コミット前に security-reviewer で確認する。
