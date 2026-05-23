import http from 'http';
import { URL } from 'url';

const DIFY_BASE_URL = 'https://api.dify.ai/v1';
const DIFY_API_KEY = process.env.DIFY_API_KEY;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/dify-chat') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        if (!DIFY_API_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'DIFY_API_KEY not configured' }));
          return;
        }

        const data = JSON.parse(body);

        const response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        const responseBody = await response.text();
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(responseBody);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Dify proxy server listening on port ${PORT}`);
});
