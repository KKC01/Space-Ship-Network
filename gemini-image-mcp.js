#!/usr/bin/env node

import readline from 'readline';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let requestId = 0;

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);

    // Initialize リクエスト
    if (request.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'gemini-image-mcp',
            version: '1.0.0'
          }
        }
      }) + '\n');
      return;
    }

    // Tools リスト
    if (request.method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'generate_image',
              description: 'Generate an image using Google Gemini API',
              inputSchema: {
                type: 'object',
                properties: {
                  prompt: {
                    type: 'string',
                    description: 'The prompt for image generation'
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

    // Tool call
    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;

      if (name === 'generate_image') {
        try {
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
          const result = await model.generateContent(args.prompt);
          const text = result.response.text();

          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: text
                }
              ]
            }
          }) + '\n');
        } catch (error) {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32603,
              message: error.message
            }
          }) + '\n');
        }
        return;
      }

      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Unknown tool: ${name}`
        }
      }) + '\n');
    }
  } catch (error) {
    const response = {
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error'
      }
    };
    if (request && request.id !== undefined) {
      response.id = request.id;
    }
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});

rl.on('close', () => {
  process.exit(0);
});
