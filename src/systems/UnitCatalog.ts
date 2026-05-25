import type { UnitType } from '../models/Spaceship';

// ユニットのサイズ区分（Customize Ship のカラム分類に使用）
export type UnitSize = 'small' | 'medium' | 'large';

// Customize Ship 画面でユニット一覧を生成・予算計算するための静的カタログ
export interface UnitSpec {
  unitType: UnitType;
  size: UnitSize;
  cost: number;
  imageKey: string;
  description: string;
  attack: string;
  comms: string;
  hp: number;
}

export const UNIT_CATALOG: Record<UnitType, UnitSpec> = {
  'Frigate':          { unitType: 'Frigate',          size: 'small',  cost:  80, imageKey: 'Frigate.png',          description: '小型・高機動。索敵と一撃離脱を担う。',          attack: 'ミサイル / レーザー',              comms: '星間通信',                    hp: 200 },
  'Legacy Frigate':   { unitType: 'Legacy Frigate',   size: 'small',  cost:  70, imageKey: 'Legacy_Frigate.png',   description: '旧式の小型艦。低コストで数を揃えやすい。',        attack: 'レーザー',                         comms: 'レガシー星間通信',            hp: 200 },
  'Repair Ship':      { unitType: 'Repair Ship',      size: 'small',  cost: 100, imageKey: 'Frigate.png',          description: '横付けで僚艦を修理する。武装は持たない。',        attack: 'なし',                             comms: '光通信',                      hp: 250 },
  'Destroyer':        { unitType: 'Destroyer',        size: 'medium', cost: 150, imageKey: 'Destroyer.png',        description: 'バランスの取れた主力艦。火力・耐久ともに中位。',  attack: 'ミサイル / レーザー',              comms: '星間通信',                    hp: 300 },
  'Legacy Destroyer': { unitType: 'Legacy Destroyer', size: 'medium', cost: 180, imageKey: 'Legacy_Destroyer.png', description: '旧式の指揮艦。通信ノードとして機能する。',        attack: 'ミサイル / レーザー',              comms: 'レガシー星間通信 / 多重通信', hp: 280 },
  'Cruiser':          { unitType: 'Cruiser',          size: 'medium', cost: 200, imageKey: 'Cruiser.png',          description: 'Destroyer 級と同等装備の重火力中型艦。',          attack: 'ミサイル / レーザー',              comms: '星間通信',                    hp: 350 },
  'Light Carrier':    { unitType: 'Light Carrier',    size: 'large',  cost: 280, imageKey: 'Light_Carrier.png',    description: '軽空母。Destroyer 級と同等装備、大型枠の入門。',  attack: 'ミサイル / レーザー',              comms: '光通信',                      hp: 400 },
  'Carrier':          { unitType: 'Carrier',          size: 'large',  cost: 400, imageKey: 'Carrier.png',          description: '大型空母。火力・耐久に優れる重量級艦。',          attack: 'ミサイル / レーザー',              comms: '光通信 / 多重通信',           hp: 500 },
};

export function getUnitsBySize(size: UnitSize): UnitSpec[] {
  return Object.values(UNIT_CATALOG).filter((u) => u.size === size);
}

export const UNIT_DISPLAY_ORDER: UnitType[] = [
  'Legacy Frigate',
  'Legacy Destroyer',
  'Frigate',
  'Destroyer',
  'Cruiser',
  'Light Carrier',
  'Carrier',
  'Repair Ship',
];

export function getAllUnitsOrdered(): UnitSpec[] {
  return UNIT_DISPLAY_ORDER.map((t) => UNIT_CATALOG[t]);
}
