#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function removeBackground(base64Input, width = 150, height = 150) {
  const buffer = Buffer.from(base64Input, 'base64');
  const img = await loadImage(buffer);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const isBackground = new Uint8Array(width * height);
  const threshold = 40;

  function isNearBlack(idx) {
    return data[idx] < threshold && data[idx + 1] < threshold && data[idx + 2] < threshold;
  }

  const stack = [];
  // Seed all border pixels that are near black
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const idx = y * width + x;
      if (isNearBlack(idx * 4)) { isBackground[idx] = 1; stack.push(idx); }
    }
  }
  for (let y = 1; y < height - 1; y++) {
    for (const x of [0, width - 1]) {
      const idx = y * width + x;
      if (isNearBlack(idx * 4)) { isBackground[idx] = 1; stack.push(idx); }
    }
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % width;
    const y = Math.floor(idx / width);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (!isBackground[nIdx] && isNearBlack(nIdx * 4)) {
        isBackground[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  // Apply transparency to background pixels
  for (let i = 0; i < width * height; i++) {
    if (isBackground[i]) {
      data[i * 4 + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/png');
}

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
      setTimeout(() => { clearInterval(t); resolve({ error: 'Timeout' }); }, 60000);
    });
  }

  try {
    await sendRequest('initialize');
    await sendRequest('tools/list');

    console.log('Generating near-future battleship spaceship...');
    const imageResponse = await sendRequest('tools/call', {
      name: 'generate_image',
      arguments: {
        prompt:
          'A realistic near-future medium allied warship spaceship, calm and composed design, ' +
          'muted gray and steel blue metallic hull with subtle panel lines, sleek silhouette, ' +
          'soft glowing blue engine thrusters, a few small laser turrets, ' +
          'slightly angled side view, photorealistic style, understated and professional aesthetic, ' +
          'pure solid black background #000000, no glow bleed, isolated object, high detail',
        width: 300,
        height: 300,
      },
    });

    if (imageResponse.result) {
      const imageContent = imageResponse.result.content.find(c => c.type === 'image');
      if (imageContent && imageContent.data) {
        const pngBuffer = await removeBackground(imageContent.data, 300, 300);
        const outputPath = path.join(__dirname, 'src', 'assets', 'spaceship-medium-gemini.png');
        fs.writeFileSync(outputPath, pngBuffer);

        console.log('SUCCESS!');
        console.log(`Image saved: ${outputPath}`);
        mcpProcess.kill();
        process.exit(0);
      }
    }

    console.error('Failed to generate image');
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
