// 通信惑星画像 (Planet_Comm.png) を生成するスクリプト
// 1. GEMINI_API_KEY 環境変数がある場合、Gemini API で画像生成を試行
// 2. 失敗時は canvas でプロシージャル生成 (薄黄色の中継惑星 + 軌道リング + アンテナ)
// 実行例:
//   GEMINI_API_KEY=xxxxx node scripts/generate_comm_planet.mjs
//   (キーなしでも canvas フォールバックで生成可能)

import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'assets', 'Comm_planet_legacy.png');

const PROMPT = `A sci-fi communication relay planet, soft glowing pale yellow gas giant with multiple orbital antenna rings, visible communication satellites and small antenna dots along the rings, subtle yellow halo glow around the planet, fully transparent background, centered square composition, clean digital illustration, 150x150 pixels.`;

async function tryGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[info] GEMINI_API_KEY が未設定 - canvas フォールバックを使用');
    return false;
  }
  try {
    // 動的 import で SDK の有無に耐性を持たせる
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);

    // 試行する画像生成モデル候補 (新しい順)
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
    // 認証情報はログ出力しない (err.message にキーが含まれないことを前提)
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

  // 外側ハローグロー（薄黄色）
  const halo = ctx.createRadialGradient(cx, cy, 30, cx, cy, 74);
  halo.addColorStop(0, 'rgba(253, 224, 71, 0.35)');
  halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // 惑星本体（黄色グラデーション球体）
  const body = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, 50);
  body.addColorStop(0, '#fef9c3');
  body.addColorStop(0.55, '#fde047');
  body.addColorStop(1, '#854d0e');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fill();

  // 表面のうっすらした帯模様
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(180, 130, 40, 0.4)';
  ctx.lineWidth = 1.5;
  for (const off of [-22, -10, 4, 18, 32]) {
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy + off);
    ctx.bezierCurveTo(cx - 20, cy + off - 3, cx + 20, cy + off + 3, cx + 50, cy + off);
    ctx.stroke();
  }
  ctx.restore();

  // 軌道リング(外側)
  ctx.strokeStyle = 'rgba(255, 255, 200, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 70, 17, Math.PI / 6, 0, Math.PI * 2);
  ctx.stroke();

  // 軌道リング(内側、薄)
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 60, 13, Math.PI / 6, 0, Math.PI * 2);
  ctx.stroke();

  // 軌道上のアンテナ衛星（白点）
  ctx.fillStyle = '#ffffff';
  const ringAngles = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3];
  const ringTilt = Math.PI / 6;
  for (const a of ringAngles) {
    // 楕円リング座標 (回転考慮の簡易近似)
    const rx = 70 * Math.cos(a);
    const ry = 17 * Math.sin(a);
    const ex = cx + rx * Math.cos(ringTilt) - ry * Math.sin(ringTilt);
    const ey = cy + rx * Math.sin(ringTilt) + ry * Math.cos(ringTilt);
    ctx.beginPath();
    ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // アンテナ細線
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex, ey - 4);
    ctx.stroke();
  }

  // 表面ハイライト
  const hi = ctx.createRadialGradient(cx - 18, cy - 18, 3, cx - 18, cy - 18, 22);
  hi.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
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
