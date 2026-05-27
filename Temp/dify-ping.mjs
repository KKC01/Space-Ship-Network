// /api/dify-chat 経由で Dify への疎通を確認するスクリプト
const start = Date.now();
try {
  const r = await fetch('http://localhost:3001/api/dify-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'ping',
      inputs: { wiki: false },
      response_mode: 'blocking',
      user: 'diag-1',
    }),
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`HTTP ${r.status} (${elapsed}s)`);
  const text = await r.text();
  console.log(text.slice(0, 800));
} catch (e) {
  console.log('ERR', e.message);
}
