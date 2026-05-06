import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateViaMCP() {
  console.log('🚀 Starting Hugging Face MCP server...');

  const mcpProcess = spawn('node', ['hf-image-mcp.js'], {
    env: {
      ...process.env,
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
          }
        } catch (e) {
          // Ignore
        }
      }
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    console.log('📋', data.toString().trim());
  });

  async function sendRequest(method, params = {}) {
    const id = messageId++;
    const request = { jsonrpc: '2.0', id, method, params };
    console.log(`\n▶️  Request ${id}: ${method}`);
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');

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
      }, 60000);
    });
  }

  try {
    // Initialize MCP
    console.log('\n📡 Initializing MCP...');
    await sendRequest('initialize');

    // List tools
    console.log('\n🔧 Getting available tools...');
    await sendRequest('tools/list');

    // Generate realistic 100x100 Earth centered on Japan via MCP
    console.log('\n🌍 Generating photorealistic 100×100 Earth centered on Japan via MCP...');
    const imageResponse = await sendRequest('tools/call', {
      name: 'generate_image',
      arguments: {
        prompt:
          'Photorealistic Earth planet viewed from space, high quality detailed, centered on Japan, blue oceans, green and brown continents, white clouds, atmospheric perspective, 100x100 pixels',
        width: 100,
        height: 100,
      },
    });

    if (imageResponse.result) {
      const imageContent = imageResponse.result.content.find(
        (c) => c.type === 'image'
      );
      if (imageContent && imageContent.data) {
        const imagePath = path.join(__dirname, 'src', 'assets', 'earth-japan-100x100.png');
        fs.mkdirSync(path.dirname(imagePath), { recursive: true });
        fs.writeFileSync(imagePath, Buffer.from(imageContent.data, 'base64'));

        console.log('\n✅ SUCCESS!');
        console.log(`📸 Image generated via MCP: ${imagePath}`);
        console.log(`📐 Size: 100×100 pixels`);
        console.log('🔧 Tool used: MCP generate_image');

        mcpProcess.kill();
        process.exit(0);
      }
    }

    console.error('\n❌ Failed to generate image');
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
  console.error('⏱️  Timeout: MCP did not complete');
  process.exit(1);
}, 120000);

generateViaMCP().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
