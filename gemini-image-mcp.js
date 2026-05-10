#!/usr/bin/env node

import { stdin, stdout, stderr } from 'process';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  stderr.write('Error: GEMINI_API_KEY environment variable not set\n');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

async function generateImageWithGemini(prompt, width = 100, height = 100) {
  try {
    stderr.write(`Generating image with Gemini: ${prompt}\n`);
    stderr.write(`Size: ${width}x${height}\n`);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

    const result = await model.generateContent(prompt);

    const response = result.response;

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            stderr.write(`Success: Image generated via Gemini\n`);
            return part.inlineData.data;
          }
        }
      }
    }

    stderr.write('No image data in response\n');
    return null;
  } catch (error) {
    stderr.write(`Gemini API error: ${error.message}\n`);
    return null;
  }
}

async function handleRequest(request) {
  const { id, method, params } = request;

  // id なし = notification（応答不要）
  if (id === undefined) return;

  try {
    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: {
          name: 'gemini-image-mcp',
          version: '1.0.0',
        },
      });
    } else if (method === 'tools/list') {
      sendResponse(id, {
        tools: [
          {
            name: 'generate_image',
            description: 'Generate an image using Google Gemini API',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'Text prompt describing the image',
                },
                width: {
                  type: 'number',
                  description: 'Image width in pixels (default: 100)',
                },
                height: {
                  type: 'number',
                  description: 'Image height in pixels (default: 100)',
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
        const base64 = await generateImageWithGemini(
          args.prompt,
          args.width || 100,
          args.height || 100
        );

        if (base64) {
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
          sendError(id, 'Failed to generate image');
        }
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

stderr.write('Gemini Image MCP Server started\n');
