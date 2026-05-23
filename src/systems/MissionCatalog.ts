import type { UnitType } from '../models/Spaceship';

export type MissionId = 'tutorial' | 'm1-rescue' | 'm2-defense' | 'm3-strike' | 'm4-boss';

// 編成 1 行（id は MainScene.applyFormation で実艦に対応する）
export interface FormationEntry {
  id: string;
  type: UnitType;
  dx: number;
  dy: number;
}

export interface MissionDef {
  id: MissionId;
  title: string;
  shortLabel: string;
  budget: number;
  description: string;
  briefingText: string;
  navigatorLines: string[];
  navigatorImage: string;
  recommendedFormation: FormationEntry[];
  available: boolean;
}

// 共通の推奨編成（既存 5 ユニット）。M2 以降は本プランの対象外なので暫定的に同編成を使う。
const DEFAULT_FORMATION: FormationEntry[] = [
  { id: 'L-Dest1', type: 'Legacy Destroyer', dx: 0,    dy: 0   },
  { id: 'Dest1',   type: 'Destroyer',        dx: -400, dy: 200 },
  { id: 'L-Frig1', type: 'Legacy Frigate',   dx: 400,  dy: 200 },
  { id: 'Frig1',   type: 'Frigate',          dx: 0,    dy: 500 },
  { id: 'Rep1',    type: 'Repair Ship',      dx: -200, dy: 600 },
];

// Tutorial は操作習得のため最小編成（L-Destroyer 1 隻のみ）
const TUTORIAL_FORMATION: FormationEntry[] = [
  { id: 'L-Dest1', type: 'Legacy Destroyer', dx: 0, dy: 0 },
  { id: 'Frig1',   type: 'Frigate',          dx: 300, dy: 200 },
];

export const MISSION_CATALOG: Record<MissionId, MissionDef> = {
  'tutorial': {
    id: 'tutorial',
    title: 'Tutorial',
    shortLabel: 'TUTORIAL',
    budget: 300,
    description: '基本操作の習得。短距離移動と通信ノードの確立を行う。',
    briefingText: '画面の操作と通信ノードの仕組みを学びます。指揮艦を移動させ、僚艦と通信を確立してください。',
    navigatorLines: [
      'ようこそ、指揮官。',
      'まずは基本操作から始めましょう。',
      '画面右下のチャットで質問もできます。',
    ],
    navigatorImage: 'operator_AI_01.png',
    recommendedFormation: TUTORIAL_FORMATION,
    available: true,
  },
  'm1-rescue': {
    id: 'm1-rescue',
    title: 'Mission 1: Rescue',
    shortLabel: 'M1 RESCUE',
    budget: 600,
    description: '遭難信号を発する僚艦を救助。サーベイポイントへ到達し、データを回収せよ。',
    briefingText: '救助対象地点へ向かい、全ユニットの通信を確保したうえで救援データを回収してください。',
    navigatorLines: [
      '救助要請が入りました。',
      'サーベイポイントに到達し、データを持ち帰ってください。',
      '通信干渉に注意を。',
    ],
    navigatorImage: 'operator_AI_02.png',
    recommendedFormation: DEFAULT_FORMATION,
    available: true,
  },
  'm2-defense': {
    id: 'm2-defense',
    title: 'Mission 2: Defense',
    shortLabel: 'M2 DEFENSE',
    budget: 700,
    description: '拠点防衛。一定時間、敵の侵攻から拠点を守りぬけ。',
    briefingText: '[後続タスクで実装] 拠点防衛ミッション。本ビルドでは M1 と同等の挙動になります。',
    navigatorLines: [
      '敵勢力の接近を確認。',
      '拠点を守りぬきましょう。',
    ],
    navigatorImage: 'operator_AI_03.png',
    recommendedFormation: DEFAULT_FORMATION,
    available: true,
  },
  'm3-strike': {
    id: 'm3-strike',
    title: 'Mission 3: Strike',
    shortLabel: 'M3 STRIKE',
    budget: 900,
    description: '敵編隊撃破。突破経路を確保せよ。',
    briefingText: '[後続タスクで実装] 突破ミッション。本ビルドでは M1 と同等の挙動になります。',
    navigatorLines: [
      '突破任務です。',
      '敵編隊を撃破し、経路を切り開いてください。',
    ],
    navigatorImage: 'operator_AI_04.png',
    recommendedFormation: DEFAULT_FORMATION,
    available: true,
  },
  'm4-boss': {
    id: 'm4-boss',
    title: 'Mission 4: Boss',
    shortLabel: 'M4 BOSS',
    budget: 1200,
    description: '最終決戦。ボス級の大型艦と対峙する。',
    briefingText: '[後続タスクで実装] 最終決戦。本ビルドでは M1 と同等の挙動になります。',
    navigatorLines: [
      '敵の主力艦を確認しました。',
      'これが最後の戦いです。武運を。',
    ],
    navigatorImage: 'operator_AI_05.png',
    recommendedFormation: DEFAULT_FORMATION,
    available: true,
  },
};

export const MISSION_ORDER: MissionId[] = ['tutorial', 'm1-rescue', 'm2-defense', 'm3-strike', 'm4-boss'];
