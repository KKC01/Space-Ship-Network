#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateViaGeminiMCP() {
  console.log('Starting Gemini MCP server...');

  const mcpProcess = spawn('node', ['gemini-image-mcp.js'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let responses = {};
  let messageId = 1;
  let stdoutBuffer = '';

  mcpProcess.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          if (response.id) responses[response.id] = response;
        } catch (e) {}
      }
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    console.log('[MCP]', data.toString().trim());
  });

  async function sendRequest(method, params = {}) {
    const id = messageId++;
    mcpProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (responses[id]) { clearInterval(t); resolve(responses[id]); }
      }, 100);
      setTimeout(() => { clearInterval(t); resolve({ error: 'Timeout' }); }, 90000);
    });
  }

  try {
    await sendRequest('initialize');
    await sendRequest('tools/list');

    console.log('Generating operator character image...');
    const imageResponse = await sendRequest('tools/call', {
      name: 'generate_image',
      arguments: {
        prompt:
          'Realistic bust-up portrait of a young Japanese woman in a spaceship operations room. ' +
          'She has short silver hair and wears a dark navy military peaked cap (seibou). ' +
          'Her uniform is a dark navy double-breasted jacket with gold buttons, closely resembling the Japan Maritime Self-Defense Force winter dress uniform. ' +
          'On her collar are Air Self-Defense Force style rank insignia for 2nd class petty officer (2-so, 2曹). ' +
          'The background shows a dimly lit spacecraft operations room with multiple glowing monitors displaying space navigation data and star charts. ' +
          'Professional, focused expression. Photorealistic style, cinematic lighting, high detail, portrait orientation.',
        width: 400,
        height: 500,
      },
    });

    if (imageResponse.result) {
      const imageContent = imageResponse.result.content.find(c => c.type === 'image');
      if (imageContent && imageContent.data) {
        const buffer = Buffer.from(imageContent.data, 'base64');
        const outputPath = path.join(__dirname, 'operator.png');
        fs.writeFileSync(outputPath, buffer);

        console.log('SUCCESS!');
        console.log(`Image saved: ${outputPath}`);
        console.log(`Size: ${buffer.length} bytes`);
        mcpProcess.kill();
        process.exit(0);
      }
    }

    console.error('Failed to generate image');
    if (imageResponse.error) console.error('Error:', imageResponse.error);
    mcpProcess.kill();
    process.exit(1);
  } catch (error) {
    console.error('Error:', error);
    mcpProcess.kill();
    process.exit(1);
  }
}

setTimeout(() => {
  console.error('Timeout');
  process.exit(1);
}, 120000);

generateViaGeminiMCP().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
