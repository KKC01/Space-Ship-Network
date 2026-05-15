// 惑星モデル：ID と通信局属性を持つ環境ハザード
export interface PlanetSpec {
  id: string;
  hasCommStation: boolean;
  description?: string;
}

export class Planet {
  public vx: number = 0;
  public vy: number = 0;

  constructor(
    public readonly id: string,
    public x: number,
    public y: number,
    public readonly hasCommStation: boolean,
    public readonly description: string = ''
  ) {}

  public update(dt: number): void {
    const dtSeconds = dt / 1000;
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
  }
}

// 配置に使う ID プール（PLN_05 を必ず含む）
export const PLANET_SPECS: PlanetSpec[] = [
  { id: 'PLN_01', hasCommStation: true, description: '通信局を有する辺境惑星。電波到達圏内では干渉が発生します。' },
  { id: 'PLN_03', hasCommStation: true, description: '通信局を有する中継惑星。電波到達圏内では干渉が発生します。' },
  { id: 'PLN_05', hasCommStation: true, description: '通信局あり。電波到達圏内では干渉が発生します。' },
];

// レガシー星間通信用の中継惑星（固定配置・ランダムプール対象外）
export const COMM_PLANET_SPEC: PlanetSpec = {
  id: 'PLN_COMM',
  hasCommStation: true,
  description: 'レガシー星間通信用の中継惑星。発信ユニットからの信号を他全ユニットへ同時転送します。',
};

// TCP/IP 星間通信用の新型中継惑星（固定配置・ランダムプール対象外）
export const COMM_TCP_PLANET_SPEC: PlanetSpec = {
  id: 'PLN_COMM_TCP',
  hasCommStation: true,
  description: 'TCP/IP 星間通信用の新型中継惑星。データ保有ユニットからの信号を高速で全ユニットへ転送します。妨害には弱い。',
};
