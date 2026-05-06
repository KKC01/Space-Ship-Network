import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateSpaceshipPixelArt() {
  const size = 20;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // Spaceship body (cyan color like in game)
  ctx.fillStyle = '#38bdf8';

  // Main body - triangle shape
  const points = [
    [10, 2],   // top point
    [6, 15],   // bottom left
    [10, 12],  // middle
    [14, 15],  // bottom right
  ];

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.lineTo(points[3][0], points[3][1]);
  ctx.fill();

  // Glow effect
  ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.beginPath();
  ctx.arc(10, 10, 8, 0, Math.PI * 2);
  ctx.fill();

  // Save
  const buffer = canvas.toBuffer('image/png');
  const outputPath = path.join(__dirname, 'src', 'assets', 'spaceship.png');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);

  console.log(`✅ Spaceship pixel art generated: ${outputPath}`);
  console.log(`Size: ${size}x${size} pixels`);
}

generateSpaceshipPixelArt();
