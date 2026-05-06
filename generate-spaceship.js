import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateSpaceshipImage() {
  const token = process.env.HF_API_TOKEN;

  if (!token) {
    console.error('Error: HF_API_TOKEN not found in environment');
    process.exit(1);
  }

  const prompt = 'A small 20x20 pixel spaceship sprite, simple geometric design, pixel art style, minimal details';

  console.log('Generating spaceship image...');

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3.5-large',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HF API error: ${response.status} - ${error}`);
    }

    const buffer = await response.arrayBuffer();
    const outputPath = path.join(__dirname, 'spaceship.png');
    fs.writeFileSync(outputPath, Buffer.from(buffer));

    console.log(`✅ Image saved: ${outputPath}`);
    console.log(`Size: ${Buffer.byteLength(buffer)} bytes`);
  } catch (error) {
    console.error('Error generating image:', error.message);
    process.exit(1);
  }
}

generateSpaceshipImage();
