#!/usr/bin/env node

// operator_AI_01.png を参照画像として、同一キャラクター・同一服装で
// 斜め45度プロファイル（3/4ビュー）の operator_AI_02.png を生成する単発スクリプト。
// Gemini 2.5 Flash Image (Nano Banana) の image-to-image を直接呼び出す。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY 環境変数が未設定です');
  process.exit(1);
}

const INPUT_PATH = path.join(__dirname, 'src/assets/character/operator_AI_01.png');
const OUTPUT_PATH = path.join(__dirname, 'src/assets/character/operator_AI_02.png');

const PROMPT = [
  'This is a reference image of a specific character. Generate a NEW image of the SAME identical character.',
  '',
  'STRICT requirements (must be preserved exactly):',
  '- Same person: same face, same eyes, same skin tone, same age (young adult)',
  '- Same hair: short silver/gray hair, same hairstyle and length',
  '- Same outfit: dark navy military-style double-breasted jacket with gold buttons,',
  '  white dress shirt, black necktie',
  '- Same headwear: dark navy peaked military cap with the gold emblem on the front',
  '- Same setting/atmosphere: dimly lit spaceship operations room with multiple glowing',
  '  monitors and holographic displays in the background, cinematic blue/teal lighting',
  '- Same art style: photorealistic, cinematic lighting, high detail',
  '- Same framing: bust-up portrait (head and upper chest visible), composition similar to the reference',
  '',
  'Change ONLY the pose and expression:',
  '- She is facing the camera (near-frontal view), looking directly toward the viewer.',
  '- She is in the middle of a calm, quiet status report — her lips are slightly parted',
  '  as if softly speaking a brief sentence. Subtle, natural mouth movement, not a wide open mouth.',
  '- Expression is slightly softened compared to the reference: still composed, professional,',
  '  and focused, but a touch warmer and gentler around the eyes and mouth. A faint,',
  '  barely-there hint of a smile is acceptable. Do NOT make her grin or smile broadly.',
  '- Eye contact with the viewer.',
  '- Posture remains upright and military, shoulders squared toward the camera.',
  '',
  'Do NOT change clothing, accessories, hair color, or character identity.',
  'Output: a single still image, portrait orientation, aspect ratio close to 2:3.',
].join('\n');

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Error: 参照画像が見つかりません: ${INPUT_PATH}`);
    process.exit(1);
  }

  const referenceBase64 = fs.readFileSync(INPUT_PATH).toString('base64');
  console.log(`参照画像を読み込みました: ${INPUT_PATH} (${referenceBase64.length} chars base64)`);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

  console.log('Gemini 2.5 Flash Image にリクエスト送信中...');
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: referenceBase64, mimeType: 'image/png' } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      // 元画像 244x346 ≒ アスペクト比 0.705。標準比では 2:3 (0.667) が最も近い
      imageConfig: { aspectRatio: '2:3' },
    },
  });

  const response = result.response;
  const candidates = response?.candidates ?? [];
  if (candidates.length === 0) {
    console.error('Error: candidates が空です');
    console.error(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  const parts = candidates[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) {
    console.error('Error: レスポンスに画像データがありません');
    console.error(JSON.stringify(parts, null, 2));
    process.exit(1);
  }

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
  fs.writeFileSync(OUTPUT_PATH, buffer);
  console.log('SUCCESS!');
  console.log(`保存先: ${OUTPUT_PATH}`);
  console.log(`サイズ: ${buffer.length} bytes`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
