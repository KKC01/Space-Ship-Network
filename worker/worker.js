// Cloudflare Worker: Dify Chat Messages API プロキシ
// DIFY_API_KEY は `wrangler secret put DIFY_API_KEY` で設定する。
// コード・リポジトリ・クライアントには鍵を一切置かない（漏洩防止）。

const DIFY_BASE_URL = 'https://api.dify.ai/v1';
// CORS 許可オリジン（公開フロントの配信元）。GitHub Pages のユーザーサイト。
const ALLOWED_ORIGIN = 'https://kkc01.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        ok: true,
        name: 'space-ship-dify',
        message: 'Worker is running',
      }), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
    }
    if (!env.DIFY_API_KEY) {
      return new Response(JSON.stringify({ error: 'DIFY_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.text();
    } catch {
      body = '{}';
    }

    const resp = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  },
};
