#!/usr/bin/env node

import { stdin, stdout, stderr } from 'process';
import { createCanvas } from 'canvas';

const HF_API_TOKEN = process.env.HF_API_TOKEN;

if (!HF_API_TOKEN) {
  stderr.write('Error: HF_API_TOKEN environment variable not set\n');
  process.exit(1);
}

// Models to try in order
const MODELS = [
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-3.5-large',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'runwayml/stable-diffusion-v1-5',
];

function sendResponse(id, result) {
  stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id, message) {
  stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message },
    }) + '\n'
  );
}

async function callHuggingFaceAPI(prompt, width = 30, height = 30) {
  const errors = [];

  for (const model of MODELS) {
    try {
      stderr.write(`Trying model: ${model}\n`);

      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          headers: {
            Authorization: `Bearer ${HF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            inputs: prompt,
            parameters: { height, width },
          }),
          timeout: 30000,
        }
      );

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        stderr.write(`Success with model: ${model}\n`);
        return Buffer.from(buffer).toString('base64');
      } else {
        const errorText = await response.text();
        errors.push(`${model}: ${response.status}`);
      }
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }

  // Fallback: Generate image locally with canvas
  stderr.write('All HF models failed, using canvas fallback\n');
  return generateImageFallback(prompt, width, height);
}

function generateImageFallback(prompt, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#000814';
  ctx.fillRect(0, 0, width, height);

  // Generate different patterns based on prompt
  if (prompt.toLowerCase().includes('earth')) {
    // Earth
    ctx.fillStyle = '#1e40af';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, width / 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.fillRect(width * 0.2, height * 0.2, width * 0.15, width * 0.15);
    ctx.fillRect(width * 0.6, height * 0.3, width * 0.15, width * 0.1);
  } else if (prompt.toLowerCase().includes('spaceship')) {
    // Spaceship
    ctx.fillStyle = '#38bdf8';
    const size = width / 4;
    ctx.beginPath();
    ctx.moveTo(width / 2, height / 2 - size);
    ctx.lineTo(width / 2 - size, height / 2 + size);
    ctx.lineTo(width / 2 + size, height / 2 + size);
    ctx.closePath();
    ctx.fill();
  } else {
    // Generic pattern
    ctx.fillStyle = '#60a5fa';
    for (let i = 0; i < width; i += 5) {
      ctx.fillRect(i, i % height, 3, 3);
    }
  }

  const buffer = canvas.toBuffer('image/png');
  return buffer.toString('base64');
}

async function handleRequest(request) {
  const { id, method, params } = request;

  try {
    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: {
          name: 'huggingface-image-mcp',
          version: '1.0.0',
        },
      });
    } else if (method === 'tools/list') {
      sendResponse(id, {
        tools: [
          {
            name: 'generate_image',
            description:
              'Generate an image using Hugging Face API (with canvas fallback)',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'Text prompt describing the image',
                },
                width: {
                  type: 'number',
                  description: 'Image width in pixels (default: 30)',
                },
                height: {
                  type: 'number',
                  description: 'Image height in pixels (default: 30)',
                },
              },
              required: ['prompt'],
            },
          },
        ],
      });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params;

      if (name === 'generate_image') {
        const base64 = await callHuggingFaceAPI(
          args.prompt,
          args.width || 30,
          args.height || 30
        );

        sendResponse(id, {
          content: [
            {
              type: 'image',
              data: base64,
              mimeType: 'image/png',
            },
            {
              type: 'text',
              text: `Generated image for: "${args.prompt}"`,
            },
          ],
        });
      } else {
        sendError(id, `Unknown tool: ${name}`);
      }
    } else {
      sendError(id, `Unknown method: ${method}`);
    }
  } catch (error) {
    sendError(id, error.message);
  }
}

// Read requests from stdin
let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const request = JSON.parse(line);
        await handleRequest(request);
      } catch (error) {
        stderr.write(`Error processing request: ${error.message}\n`);
      }
    }
  }
});

stdin.on('end', () => {
  process.exit(0);
});

stderr.write('HF Image MCP Server started\n');
