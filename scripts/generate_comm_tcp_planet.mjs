// 新型通信惑星画像 (Planet_Comm_TCP.png) を生成するスクリプト
// 1. GEMINI_API_KEY 環境変数がある場合、Gemini API で画像生成を試行
// 2. 失敗時は canvas でプロシージャル生成 (青〜シアン系の TCP/IP テクノロジー惑星)
// 実行例:
//   GEMINI_API_KEY=xxxxx node scripts/generate_comm_tcp_planet.mjs
//   (キーなしでも canvas フォールバックで生成可能)

import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'assets', 'Comm_planet.png');

const PROMPT = `A sci-fi TCP/IP data relay planet, deep navy blue sphere with glowing cyan digital grid lines and circuit patterns on the surface, multiple sharp angular orbital rings with bright scan-line glow, hexagonal data nodes along the rings, subtle cyan halo glow around the planet, transparent background, centered square composition, clean digital illustration, 150x150 pixels.`;

async function tryGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[info] GEMINI_API_KEY が未設定 - canvas フォールバックを使用');
    return false;
  }
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);

    const candidates = [
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.0-flash-preview-image-generation',
      'gemini-2.0-flash-exp',
    ];

    for (const modelName of candidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseModalities: ['Image', 'Text'],
          },
        });
        const result = await model.generateContent(PROMPT);
        const parts = result?.response?.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            const buf = Buffer.from(part.inlineData.data, 'base64');
            fs.writeFileSync(OUTPUT_PATH, buf);
            console.log(`[ok] Gemini (${modelName}) で生成完了:`, OUTPUT_PATH);
            return true;
          }
        }
        console.warn(`[warn] ${modelName}: 画像データなし - 次のモデルを試行`);
      } catch (innerErr) {
        console.warn(`[warn] ${modelName} 失敗:`, innerErr?.message?.split('\n')[0] ?? 'unknown');
      }
    }
    return false;
  } catch (err) {
    console.warn('[warn] Gemini 呼び出し失敗 - フォールバックへ:', err?.message ?? 'unknown error');
    return false;
  }
}

function canvasFallback() {
  const W = 150;
  const H = 150;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = W / 2;
  const cy = H / 2;

  // 外側ハローグロー（シアン）
  const halo = ctx.createRadialGradient(cx, cy, 30, cx, cy, 74);
  halo.addColorStop(0, 'rgba(34, 211, 238, 0.45)');
  halo.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // 惑星本体（濃紺〜青のグラデーション球体）
  const body = ctx.createRadialGradient(cx - 14, cy - 14, 4, cx, cy, 50);
  body.addColorStop(0, '#3b82f6');
  body.addColorStop(0.5, '#1e3a8a');
  body.addColorStop(1, '#0c1a3d');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fill();

  // 表面のデジタルグリッド模様（経度方向）
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
  ctx.lineWidth = 0.8;
  // 経線
  for (const offX of [-36, -22, -8, 6, 20, 34]) {
    ctx.beginPath();
    ctx.moveTo(cx + offX, cy - 48);
    ctx.bezierCurveTo(cx + offX * 0.6, cy - 16, cx + offX * 0.6, cy + 16, cx + offX, cy + 48);
    ctx.stroke();
  }
  // 緯線
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
  for (const offY of [-32, -16, 0, 16, 32]) {
    const r = Math.sqrt(48 * 48 - offY * offY);
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + offY);
    ctx.lineTo(cx + r, cy + offY);
    ctx.stroke();
  }

  // ランダムな六角形データノード（明るいシアンの点）
  ctx.fillStyle = 'rgba(165, 243, 252, 0.95)';
  const nodes = [
    { x: -22, y: -10 },
    { x: 8, y: -22 },
    { x: 24, y: 4 },
    { x: -12, y: 18 },
    { x: 16, y: 28 },
    { x: -30, y: 22 },
  ];
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(cx + n.x, cy + n.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 軌道リング(外側) - 鋭角的なスキャンライン
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 72, 14, -Math.PI / 8, 0, Math.PI * 2);
  ctx.stroke();

  // 軌道リング(内側、明るいシアン)
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 62, 10, -Math.PI / 8, 0, Math.PI * 2);
  ctx.stroke();

  // 軌道リング(さらに内側、極細)
  ctx.strokeStyle = 'rgba(165, 243, 252, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 54, 7, -Math.PI / 8, 0, Math.PI * 2);
  ctx.stroke();

  // 軌道上の六角形データノード（光る角ばった点）
  const ringAngles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
  const ringTilt = -Math.PI / 8;
  for (const a of ringAngles) {
    const rx = 72 * Math.cos(a);
    const ry = 14 * Math.sin(a);
    const ex = cx + rx * Math.cos(ringTilt) - ry * Math.sin(ringTilt);
    const ey = cy + rx * Math.sin(ringTilt) + ry * Math.cos(ringTilt);
    // 六角形ノード
    ctx.fillStyle = 'rgba(207, 250, 254, 0.95)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i;
      const px = ex + Math.cos(ang) * 2.4;
      const py = ey + Math.sin(ang) * 2.4;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // 微細グロー
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // 表面ハイライト（北西側に明るい反射）
  const hi = ctx.createRadialGradient(cx - 20, cy - 20, 3, cx - 20, cy - 20, 24);
  hi.addColorStop(0, 'rgba(186, 230, 253, 0.55)');
  hi.addColorStop(1, 'rgba(186, 230, 253, 0)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  fs.writeFileSync(OUTPUT_PATH, canvas.toBuffer('image/png'));
  console.log('[ok] canvas フォールバックで生成完了:', OUTPUT_PATH);
}

const ok = await tryGemini();
if (!ok) canvasFallback();
