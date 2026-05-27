const start = Date.now();
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 90000);
try {
  const r = await fetch('http://localhost:3001/api/dify-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'ping',
      inputs: { wiki: false },
      response_mode: 'blocking',
      user: 'diag-direct',
    }),
    signal: ctrl.signal,
  });
  const sec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`HTTP ${r.status} (${sec}s)`);
  const t = await r.text();
  console.log('BODY:', t.slice(0, 1200));
} catch (e) {
  const sec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`ERR (${sec}s):`, e.name, e.message);
} finally {
  clearTimeout(timer);
}
