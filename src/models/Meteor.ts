export type MeteorSize = 'LARGE' | 'MEDIUM' | 'SMALL' | 'TINY';

// 隕石モデル：ユニットに向かって接近する環境脅威
export class Meteor {
  public id: string;
  public x: number;
  public y: number;
  public targetUnitId: string;
  public speed: number;
  public hp: number;
  public maxHp: number;
  public rotation: number = 0;
  public isDetected: boolean = false;
  public isDestroyed: boolean = false;
  public sizeType: MeteorSize;
  public vx: number = 0;
  public vy: number = 0;
  public radius: number = 20;

  // 回転速度（ラジアン/秒）
  private rotationSpeed: number;

  constructor(id: string, x: number, y: number, targetUnitId: string, targetX: number, targetY: number, sizeType: MeteorSize, speed: number = 30) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.targetUnitId = targetUnitId;
    this.sizeType = sizeType;
    this.speed = speed;

    switch (sizeType) {
      case 'LARGE': 
        this.hp = 200; 
        this.radius = 512 * 0.1; 
        break;
      case 'MEDIUM': 
        this.hp = 100; 
        this.radius = 512 * (0.1 / 3); 
        break;
      case 'SMALL': 
        this.hp = 50; 
        this.radius = 512 * (0.1 / 5); 
        break;
      case 'TINY': 
        this.hp = 20; 
        this.radius = 512 * (0.1 / 10); 
        break;
    }
    this.maxHp = this.hp;

    // ターゲット方向の固定ベクトルを計算
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      this.vx = (dx / dist) * this.speed;
      this.vy = (dy / dist) * this.speed;
    }

    // ランダムな回転速度
    this.rotationSpeed = (Math.random() - 0.5) * 1.5;
  }

  /**
   * 直線移動と回転角度の更新
   */
  public update(dt: number): void {
    if (this.isDestroyed) return;

    const dtSeconds = dt / 1000;
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
    this.rotation += this.rotationSpeed * dtSeconds;
  }

  /**
   * ダメージを受けてHPを減算
   */
  public takeDamage(amount: number): void {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDestroyed = true;
    }
  }
}
