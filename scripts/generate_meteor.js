// 30x30 透過 PNG の隕石（火の尾付き・リアル調）を生成するスクリプト
// 実行: node scripts/generate_meteor.js
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 30;
const H = 30;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// 隕石中心（右下寄り）と尾の終点（左上）
const cx = 20;
const cy = 20;
const trailEndX = 2;
const trailEndY = 2;

// ---- 火の尾（左上方向へ伸びる、外周ほど薄く広く）----
const trailPasses = [
  { width: 11, color: 'rgba(204, 51, 0, 0.16)' },    // 外側赤グロー
  { width: 8,  color: 'rgba(255, 80, 0, 0.30)' },    // 赤橙
  { width: 5,  color: 'rgba(255, 140, 0, 0.55)' },   // オレンジ
  { width: 3,  color: 'rgba(255, 215, 80, 0.80)' },  // 黄
  { width: 1.4, color: 'rgba(255, 255, 230, 0.95)' } // 中心の白熱
];
ctx.lineCap = 'round';
for (const p of trailPasses) {
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.width;
  ctx.beginPath();
  ctx.moveTo(trailEndX, trailEndY);
  ctx.lineTo(cx, cy);
  ctx.stroke();
}

// ---- 隕石本体（不規則な岩塊シルエット）----
const bodyPoints = [
  [cx - 6, cy - 2], [cx - 4, cy - 5], [cx, cy - 7], [cx + 4, cy - 5],
  [cx + 6, cy - 1], [cx + 7, cy + 3], [cx + 5, cy + 6], [cx + 1, cy + 7],
  [cx - 3, cy + 6], [cx - 6, cy + 3]
];
ctx.beginPath();
bodyPoints.forEach(([x, y], i) => {
  if (i === 0) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
});
ctx.closePath();

// 本体のラジアルグラデーション（進行方向側=右下が明るい）
const grad = ctx.createRadialGradient(cx + 2, cy + 2, 1, cx, cy, 9);
grad.addColorStop(0.0, '#a88060');
grad.addColorStop(0.5, '#6a4a38');
grad.addColorStop(1.0, '#2e1f17');
ctx.fillStyle = grad;
ctx.fill();

// クレーター（暗いドット）
const craters = [
  [cx - 2, cy - 1, 1.2],
  [cx + 2, cy + 1, 1.0],
  [cx - 1, cy + 3, 0.8],
  [cx + 3, cy - 2, 0.7]
];
ctx.fillStyle = 'rgba(35, 22, 14, 0.85)';
for (const [x, y, r] of craters) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// 進行方向（右下）の縁にホットなリム光
ctx.fillStyle = 'rgba(255, 170, 90, 0.55)';
ctx.beginPath();
ctx.arc(cx + 4, cy + 3, 1.6, 0, Math.PI * 2);
ctx.fill();

// 出力
const outPath = path.resolve(__dirname, '../src/assets/meteor/meteor.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log('Saved:', outPath);
