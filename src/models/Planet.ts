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
