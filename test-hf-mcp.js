import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMCP() {
  console.log('Starting Hugging Face MCP server...');

  const mcpProcess = spawn('node', ['hf-image-mcp.js'], {
    env: {
      ...process.env,
      HF_API_TOKEN: process.env.HF_API_TOKEN,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let responses = {};
  let messageId = 1;

  // Collect responses
  mcpProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          if (response.id) {
            responses[response.id] = response;
            console.log(`Response ${response.id}:`, JSON.stringify(response).slice(0, 150));
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    console.log('Server log:', data.toString());
  });

  // Send requests in sequence
  async function sendRequest(method, params = {}) {
    const id = messageId++;
    const request = { jsonrpc: '2.0', id, method, params };
    console.log(`\nSending request ${id}: ${method}`);
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');

    // Wait for response
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (responses[id]) {
          clearInterval(checkInterval);
          resolve(responses[id]);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({ error: 'Timeout' });
      }, 30000);
    });
  }

  try {
    // Step 1: Initialize
    console.log('\n=== Step 1: Initialize ===');
    await sendRequest('initialize');

    // Step 2: List tools
    console.log('\n=== Step 2: List tools ===');
    await sendRequest('tools/list');

    // Step 3: Call generate_image tool
    console.log('\n=== Step 3: Generate Earth image ===');
    const imageResponse = await sendRequest('tools/call', {
      name: 'generate_image',
      arguments: {
        prompt: 'Earth planet, globe, blue and green colors, minimalist, 30x30 pixel art',
        width: 30,
        height: 30,
      },
    });

    // Extract and save image
    if (imageResponse.result) {
      const imageContent = imageResponse.result.content.find((c) => c.type === 'image');
      if (imageContent && imageContent.data) {
        const imagePath = path.join(__dirname, 'src', 'assets', 'earth.png');
        fs.mkdirSync(path.dirname(imagePath), { recursive: true });
        fs.writeFileSync(imagePath, Buffer.from(imageContent.data, 'base64'));
        console.log(`\n✅ Image successfully saved via MCP: ${imagePath}`);
        mcpProcess.kill();
        process.exit(0);
      }
    }

    console.error('\n❌ No image data in response');
    mcpProcess.kill();
    process.exit(1);
  } catch (error) {
    console.error('Error:', error);
    mcpProcess.kill();
    process.exit(1);
  }
}

// Timeout after 120 seconds
setTimeout(() => {
  console.error('Timeout: MCP did not complete');
  process.exit(1);
}, 120000);

testMCP().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
