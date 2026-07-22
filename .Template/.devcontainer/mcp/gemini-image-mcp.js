#!/usr/bin/env node

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { GoogleGenAI, Modality } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  let request;
  try {
    request = JSON.parse(line);

    if (request.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'gemini-image-mcp', version: '2.0.0' }
        }
      }) + '\n');
      return;
    }

    if (request.method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'generate_image',
              description: 'Generate an image using Google Gemini API (gemini-2.5-flash-image) and save it as a PNG file',
              inputSchema: {
                type: 'object',
                properties: {
                  prompt: {
                    type: 'string',
                    description: 'The prompt for image generation'
                  },
                  outputPath: {
                    type: 'string',
                    description: 'Absolute path to save the generated PNG. Defaults to Temp folder.'
                  },
                  width: {
                    type: 'number',
                    description: 'Output width in pixels (resized). Default 100.'
                  },
                  height: {
                    type: 'number',
                    description: 'Output height in pixels (resized). Default 100.'
                  }
                },
                required: ['prompt']
              }
            }
          ]
        }
      }) + '\n');
      return;
    }

    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;

      if (name === 'generate_image') {
        try {
          const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: args.prompt,
            config: {
              responseModalities: [Modality.TEXT, Modality.IMAGE]
            }
          });

          const parts = response.candidates?.[0]?.content?.parts ?? [];
          const imagePart = parts.find((p) => p.inlineData?.data);
          if (!imagePart) {
            const textOut = parts.map((p) => p.text).filter(Boolean).join(' ');
            throw new Error('No image returned by model. Text: ' + (textOut || '(none)'));
          }

          const w = args.width ?? 100;
          const h = args.height ?? 100;
          const img = await loadImage(Buffer.from(imagePart.inlineData.data, 'base64'));
          const canvas = createCanvas(w, h);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const pngBuffer = canvas.toBuffer('image/png');

          const outPath = args.outputPath
            || path.join(process.cwd(), 'Temp', `gemini-image-${Date.now()}.png`);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, pngBuffer);

          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: `Image saved to ${outPath} (${w}x${h})` }]
            }
          }) + '\n');
        } catch (error) {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32603, message: error.message }
          }) + '\n');
        }
        return;
      }

      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Unknown tool: ${name}` }
      }) + '\n');
    }
  } catch (error) {
    const response = {
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' }
    };
    if (request && request.id !== undefined) response.id = request.id;
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});

rl.on('close', () => process.exit(0));
