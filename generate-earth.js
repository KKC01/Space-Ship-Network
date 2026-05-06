import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateEarthPixelArt() {
  const size = 30;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - space
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // Earth - blue ocean base
  ctx.fillStyle = '#1e40af';
  ctx.beginPath();
  ctx.arc(15, 15, 12, 0, Math.PI * 2);
  ctx.fill();

  // Land masses - green
  ctx.fillStyle = '#22c55e';

  // North America
  ctx.fillRect(5, 8, 4, 4);

  // South America
  ctx.fillRect(6, 14, 2, 3);

  // Africa/Europe
  ctx.fillRect(15, 8, 5, 5);

  // Asia
  ctx.fillRect(20, 10, 6, 4);

  // Australia
  ctx.fillRect(23, 18, 2, 2);

  // Glow effect
  ctx.fillStyle = 'rgba(30, 64, 175, 0.3)';
  ctx.beginPath();
  ctx.arc(15, 15, 13, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(18, 12, 3, 3);

  // Save
  const buffer = canvas.toBuffer('image/png');
  const outputPath = path.join(__dirname, 'src', 'assets', 'earth.png');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);

  console.log(`✅ Earth pixel art generated: ${outputPath}`);
  console.log(`Size: ${size}x${size} pixels`);
}

generateEarthPixelArt();
