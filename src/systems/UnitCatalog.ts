import type { UnitType } from '../models/Spaceship';

// ユニットのサイズ区分（Customize Ship のカラム分類に使用）
export type UnitSize = 'small' | 'medium' | 'large';

// Customize Ship 画面でユニット一覧を生成・予算計算するための静的カタログ
export interface UnitSpec {
  unitType: UnitType;
  size: UnitSize;
  cost: number; // ミッション固定予算に対する消費コスト
  role: string; // UI 上のロール表示（攻撃 / 支援 / 偵察 など）
  imageKey: string; // src/assets/Space_Ship/<file> のファイル名（拡張子込）
  description: string;
}

export const UNIT_CATALOG: Record<UnitType, UnitSpec> = {
  'Frigate':          { unitType: 'Frigate',          size: 'small',  cost:  80, role: '偵察/攻撃', imageKey: 'Frigate.png',          description: '小型・高機動。索敵と一撃離脱を担う。' },
  'Legacy Frigate':   { unitType: 'Legacy Frigate',   size: 'small',  cost:  70, role: '偵察',     imageKey: 'Legacy_Frigate.png',   description: '旧式の小型艦。低コストで数を揃えやすい。' },
  'Repair Ship':      { unitType: 'Repair Ship',      size: 'small',  cost: 100, role: '支援',     imageKey: 'Frigate.png',          description: '横付けで僚艦を修理する。武装は持たない。' },
  'Destroyer':        { unitType: 'Destroyer',        size: 'medium', cost: 150, role: '主力',     imageKey: 'Destroyer.png',        description: 'バランスの取れた主力艦。火力・耐久ともに中位。' },
  'Legacy Destroyer': { unitType: 'Legacy Destroyer', size: 'medium', cost: 180, role: '指揮',     imageKey: 'Legacy_Destroyer.png', description: '旧式の指揮艦。通信ノードとして機能する。' },
  'Cruiser':          { unitType: 'Cruiser',          size: 'medium', cost: 200, role: '攻撃',     imageKey: 'Cruiser.png',          description: 'Destroyer 級と同等装備の重火力中型艦。' },
  'Light Carrier':    { unitType: 'Light Carrier',    size: 'large',  cost: 280, role: '攻撃',     imageKey: 'Light_Carrier.png',    description: '軽空母。Destroyer 級と同等装備、大型枠の入門。' },
  'Carrier':          { unitType: 'Carrier',          size: 'large',  cost: 400, role: '攻撃',     imageKey: 'Carrier.png',          description: '大型空母。火力・耐久に優れる重量級艦。' },
};

export function getUnitsBySize(size: UnitSize): UnitSpec[] {
  return Object.values(UNIT_CATALOG).filter((u) => u.size === size);
}
