import { DataPacket, PacketType, FreqShort, FreqLong } from './DataPacket';

// 被害種別・規模・状態（戦闘指揮モード被害対処用）
export type DamageKind = 'fire' | 'breach';

export interface MissileState {
  id: string;
  x: number;
  y: number;
  targetMeteorId: string;
  speed: number;
}
export type DamageSize = 'small' | 'medium' | 'large';
export type DamagePhase = 'active' | 'treating';
export type EquipmentLevel = 'GOOD' | 'POOR' | 'UNABLE';

// ユニット種別。issue #5 で導入。
//   Legacy Destroyer / Destroyer / Legacy Frigate / Frigate / Repair Ship
//   + Light Carrier / Carrier / Cruiser（初期画面 Customize Ship 導入時に追加）
// 既存の HQ Ship は Legacy Destroyer として扱う。
// 新規 3 種は装備・挙動とも Destroyer 級と同一として扱う（カタログ上のサイズ/コストのみ差分）。
export type UnitType =
  | 'Legacy Destroyer'
  | 'Destroyer'
  | 'Legacy Frigate'
  | 'Frigate'
  | 'Repair Ship'
  | 'Light Carrier'
  | 'Carrier'
  | 'Cruiser';

// Repair Ship との横付け修理フェーズ
//   approaching: 互いに接近中、横付け前
//   docked: 横付け完了、HP 回復中
export type DockingPhase = 'approaching' | 'docked';

export interface Damage {
  id: string;
  kind: DamageKind;
  size: DamageSize;
  phase: DamagePhase;
  treatStartedAt: number | null;
}

export class Spaceship {
  public id: string;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;

  // ユニット種別（Legacy Destroyer / Destroyer / Legacy Frigate / Frigate / Repair Ship）
  public unitType: UnitType;

  public targetX: number | null = null;
  public targetY: number | null = null;
  public readonly MAX_SPEED = 50;
  
  public queue: DataPacket[] = [];
  public level: number;
  
  public isShortEnabled: boolean = true;
  public shortFreq: FreqShort = 'A';
  public isLongEnabled: boolean = false;
  public longFreq: FreqLong = 'D';

  public isTransmitProhibited: boolean = false;

  // Communication Equipment Status
  public equipment = {
    shortAntenna: 'green' as 'green' | 'yellow' | 'red',
    longAntenna: 'green' as 'green' | 'yellow' | 'red',
    cipher: 'green' as 'green' | 'yellow' | 'red',
    processor: 'green' as 'green' | 'yellow' | 'red',
    display: 'green' as 'green' | 'yellow' | 'red'
  };

  // Optical Multiplex (TDMA) Settings
  public isMultiplexEnabled: boolean = false;
  public multiplexSpeed: 'low' | 'medium' | 'high' = 'low';
  public multiplexCipher: 'AA' | 'BB' = 'AA';
  public isOpticalRelayEnabled: boolean = false;
  public assignedSlots: number[] = [];
  public selectedMasterId: string | null = null;
  public lastTransmittedSlot: number = -1;

  // レガシー星間通信 (通信惑星経由の一斉同報)
  public isLegacyEnabled: boolean = false;
  // 周期ポーリング用タイマ
  public legacyTimer: number = 0;

  // TCP/IP 星間通信 (新型通信惑星経由・データ保有時に即送信)
  public isTcpIpEnabled: boolean = false;
  // 連続送信抑制用クールダウン (ms)
  public tcpIpCooldown: number = 0;
  
  public hp: number = 300;
  public maxHp: number = 300;
  public lastReceivedSourceId: string | null = null;
  public lastReceivedAt: number = 0;

  // 戦闘指揮モード被害対処
  public damages: Damage[] = [];
  public damageCounter: number = 0;
  public combatEquipment = {
    armor: 'GOOD' as EquipmentLevel,
    comm: 'GOOD' as EquipmentLevel,
    weapon: 'GOOD' as EquipmentLevel,
    // 通信系の個別ステータス（被害対処タブに表示）
    tcpIp: 'GOOD' as EquipmentLevel,      // 星間通信
    legacy: 'GOOD' as EquipmentLevel,     // レガシー星間通信
    multiplex: 'GOOD' as EquipmentLevel,  // 多重通信
    optical: 'GOOD' as EquipmentLevel,    // 光通信
  };

  // 攻撃関連（隕石戦闘用）
  public attackTargetMeteorId: string | null = null;
  public attackCooldown: number = 0;
  public readonly ATTACK_RANGE: number = 100;     // 射程: 戦闘指揮モードの内側サークルと一致
  public readonly DETECTION_RANGE: number = 400;  // 探知距離: 外側サークルと一致
  public readonly ATTACK_DAMAGE: number = 25;
  public readonly ATTACK_COOLDOWN_MS: number = 1000;

  // ミサイル定数
  public readonly MISSILE_RANGE: number = 300;
  public readonly MISSILE_DAMAGE: number = 50;
  public readonly MISSILE_LAUNCH_INTERVAL_MS: number = 2000;
  public readonly MISSILE_MAX_PER_TARGET: number = 3;
  public readonly MISSILE_MAX_TOTAL: number = 10;
  public readonly MISSILE_SPEED: number = 200;

  // 残弾定数
  public readonly MISSILE_AMMO_MAX: number = 20;
  public readonly LASER_AMMO_MAX: number = 30;

  // ミサイル飛翔状態
  public missilesInFlight: MissileState[] = [];
  public lastMissileLaunchAt: number = 0;

  // 残弾
  public missileAmmo: number = 20;
  public laserAmmo: number = 30;

  // 武器別ステータス（missile/laser を個別に管理し、combatEquipment.weapon に集約）
  public weaponStatus: { missile: EquipmentLevel; laser: EquipmentLevel } = { missile: 'GOOD', laser: 'GOOD' };

  // Node Functionality
  public isNodeActive: boolean = false;
  public pollingList: string[] = [];
  public isWaitingForResponse: boolean = false;
  private pollingTimer: number = 0;
  private static readonly POLLING_DELAY_MS = 33; 
  public currentPollingIndex: number = 0;

  public freqChangeTimer: number = 0;
  public pendingFreqChange: any = null;
  private pendingCmdId: string | null = null;
  private processedCmdIds: Set<string> = new Set();

  // === Repair Ship 横付け修理 ===
  // dockingPartnerId: 接近 / 横付け中のパートナーID（Repair Ship 側からは修理対象、他ユニット側からは Repair Ship）
  // dockingPhase: 接近中 / 横付け中。null は未関与。
  // dockHealStartHp: 横付け開始時の HP（回復目標 = startHp + (maxHp - startHp) / 2 の算出に使用）
  public dockingPartnerId: string | null = null;
  public dockingPhase: DockingPhase | null = null;
  public dockHealStartHp: number | null = null;

  constructor(id: string, x: number, y: number, level: number = 1, unitType: UnitType = 'Legacy Destroyer') {
    this.id = id;
    this.x = x;
    this.y = y;
    this.level = level;
    this.unitType = unitType;
    // Repair Ship は武装がレーザーのみ。ミサイル弾数を 0 にして発射不能にする。
    if (unitType === 'Repair Ship') {
      this.missileAmmo = 0;
    }
  }

  /** Repair Ship かどうか */
  public isRepairShip(): boolean {
    return this.unitType === 'Repair Ship';
  }

  /** ミサイル運用可否（Repair Ship は不可: 武装はレーザーのみ） */
  public canEquipMissile(): boolean {
    return !this.isRepairShip();
  }

  /** 多重通信運用可否（Repair Ship は不可） */
  public canUseMultiplex(): boolean {
    return !this.isRepairShip();
  }

  /** レガシー星間通信運用可否（Repair Ship は不可） */
  public canUseLegacyComm(): boolean {
    return !this.isRepairShip();
  }

  /** 星間通信 (TCP/IP) 運用可否（Repair Ship は不可） */
  public canUseTcpIpComm(): boolean {
    return !this.isRepairShip();
  }

  public update(dt: number, allShips?: Map<string, Spaceship>, onPoll?: (node: Spaceship, target: Spaceship) => void) {
    const dtSeconds = dt / 1000;
    
    if (this.targetX !== null && this.targetY !== null) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      // Repair Ship との接近 / 横付け中は通常速力の半分
      const speed = (this.dockingPartnerId && !this.isRepairShip())
        ? this.MAX_SPEED * 0.5
        : this.MAX_SPEED;

      if (dist > 2) {
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
      } else {
        this.vx = 0;
        this.vy = 0;
        this.x = this.targetX;
        this.y = this.targetY;
        this.targetX = null;
        this.targetY = null;
      }
    }
    
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
    
    if (this.isNodeActive && allShips && onPoll) {
      if (!this.isWaitingForResponse) {
        this.pollingTimer -= dt;
        if (this.pollingTimer <= 0) {
          this.pollingTimer = Spaceship.POLLING_DELAY_MS;
          if (this.pollingList.length > 0) {
            const targetId = this.pollingList[this.currentPollingIndex];
            const target = allShips.get(targetId);
            if (target && target.id !== this.id) {
              this.isWaitingForResponse = true;
              onPoll(this, target);
              this.currentPollingIndex = (this.currentPollingIndex + 1) % this.pollingList.length;
            } else {
              this.currentPollingIndex = (this.currentPollingIndex + 1) % this.pollingList.length;
            }
          }
        }
      }
    }
    
    if (this.pendingFreqChange) {
      this.freqChangeTimer -= dtSeconds;
      if (this.freqChangeTimer <= 0) {
        const mistakeChance = (5 - this.level) * 0.15; 
        
        // 1. Short Range Sync
        if (this.pendingFreqChange.shortFreq) {
           if (this.pendingFreqChange.isShortEnabled) this.isShortEnabled = true;
           
           if (Math.random() < mistakeChance) {
               const freqs: FreqShort[] = ['A', 'B', 'C'];
               this.shortFreq = freqs[Math.floor(Math.random() * freqs.length)];
           } else {
               this.shortFreq = this.pendingFreqChange.shortFreq;
           }
        }
        
        // 2. Long Range Sync
        if (this.pendingFreqChange.longFreq) {
           if (this.pendingFreqChange.isLongEnabled) this.isLongEnabled = true;
           
           if (Math.random() < mistakeChance) {
               const freqs: FreqLong[] = ['D', 'E', 'F'];
               this.longFreq = freqs[Math.floor(Math.random() * freqs.length)];
           } else {
               this.longFreq = this.pendingFreqChange.longFreq;
           }
        }
        
        this.pendingFreqChange = null;
        // Mark this CMD as fully processed so it won't be re-applied
        if (this.pendingCmdId) {
          this.processedCmdIds.add(this.pendingCmdId);
          this.pendingCmdId = null;
        }
        this.queue.push({
          id: `rgr-${Date.now()}-${this.id}`,
          type: PacketType.RGR,
          createdAt: Date.now(),
          originShipId: this.id,
          payload: { shortFreq: this.shortFreq, longFreq: this.longFreq, isShortEnabled: this.isShortEnabled, isLongEnabled: this.isLongEnabled }
        });
      }
    }
    
    const now = Date.now();
    this.queue = this.queue.filter(p => (now - p.createdAt) < 90000);
  }

  public receivePacket(packet: DataPacket) {
    this.lastReceivedSourceId = packet.originShipId;
    this.lastReceivedAt = Date.now();

    // 1. Process specific packet types (Instructions)
    if (packet.type === PacketType.FREQ_CHANGE || packet.type === PacketType.CMD) {
      // Skip if this CMD was already fully processed (prevents overriding manual changes)
      if (this.processedCmdIds.has(packet.id)) {
        // Already applied this command — do not re-process
      } else if (!packet.targetShipId || packet.targetShipId === this.id) {
        const p = packet.payload;
        if (p) {
          const isAlreadyApplied = 
            (p.isShortEnabled === undefined || p.isShortEnabled === this.isShortEnabled) &&
            (p.shortFreq === undefined || p.shortFreq === this.shortFreq) &&
            (p.isLongEnabled === undefined || p.isLongEnabled === this.isLongEnabled) &&
            (p.longFreq === undefined || p.longFreq === this.longFreq);

          const isAlreadyPending = this.pendingFreqChange &&
            JSON.stringify(this.pendingFreqChange) === JSON.stringify(p);

          if (!isAlreadyApplied && !isAlreadyPending) {
            this.pendingFreqChange = p;
            this.pendingCmdId = packet.id;
            this.freqChangeTimer = (6 - this.level) * 1.5; 
          }
        }
      }
    }

    // 2. Relay logic: Always queue for relay if not seen before
    if (!this.queue.some(p => p.id === packet.id)) {
      // If it's an optical packet, check encryption
      if (packet.payload?.isOptical) {
        if (packet.payload.cipher !== this.multiplexCipher) {
          // Encryption mismatch, discard
          return;
        }
        // If relay is OFF, only keep if it's for us
        if (!this.isOpticalRelayEnabled && packet.targetShipId && packet.targetShipId !== this.id) {
          return;
        }
      }
      this.queue.push(packet);
    }
  }

  public applyFreqChange(payload: any) {
    if (payload.isShortEnabled !== undefined) this.isShortEnabled = payload.isShortEnabled;
    if (payload.shortFreq) this.shortFreq = payload.shortFreq;
    if (payload.isLongEnabled !== undefined) this.isLongEnabled = payload.isLongEnabled;
    if (payload.longFreq) this.longFreq = payload.longFreq;
    
    // Add RGR packet to inform the network of the change
    this.queue.push({
      id: `rgr-manual-${Date.now()}-${this.id}`,
      type: PacketType.RGR,
      createdAt: Date.now(),
      originShipId: this.id,
      payload: { shortFreq: this.shortFreq, longFreq: this.longFreq, isShortEnabled: this.isShortEnabled, isLongEnabled: this.isLongEnabled }
    });
  }

  public getPacketsToTransmit(): DataPacket[] {
    if (this.isTransmitProhibited) return [];
    return [...this.queue];
  }

  /** Short-range comm chain: shortAntenna → cipher → processor */
  public isShortCommFunctional(): boolean {
    return this.equipment.shortAntenna !== 'red' &&
           this.equipment.cipher !== 'red' &&
           this.equipment.processor !== 'red';
  }

  /** Long-range comm chain: longAntenna → cipher → processor */
  public isLongCommFunctional(): boolean {
    return this.equipment.longAntenna !== 'red' &&
           this.equipment.cipher !== 'red' &&
           this.equipment.processor !== 'red';
  }

  /**
   * 残存する被害から1秒あたりのHP減少量を算出（大=3 / 中=2 / 小=1）。
   * 応急修理中(`phase === 'treating'`)でも修理完了まで HP は減り続ける仕様。
   * 修理完了と同時に `damages` 配列から削除されるため、ドレインも自動的に終わる。
   */
  public getDamageHpDrainPerSec(): number {
    let total = 0;
    for (const d of this.damages) {
      if (d.size === 'large') total += 3;
      else if (d.size === 'medium') total += 2;
      else total += 1;
    }
    return total;
  }

  /** 現存する破口から装甲ステータスを再計算（無=GOOD / 小中=POOR / 大=UNABLE） */
  public recalcArmorStatus(): void {
    const breaches = this.damages.filter(d => d.kind === 'breach');
    if (breaches.length === 0) {
      this.combatEquipment.armor = 'GOOD';
      return;
    }
    if (breaches.some(b => b.size === 'large')) {
      this.combatEquipment.armor = 'UNABLE';
    } else {
      this.combatEquipment.armor = 'POOR';
    }
  }

  /** missile/laser の個別ステータスから集約 weapon ステータスを再計算 */
  public recalcWeaponStatus(): void {
    const statuses = [this.weaponStatus.missile, this.weaponStatus.laser];
    // POOR または UNABLE を「故障」とみなし、件数で集約
    const faultCount = statuses.filter(s => s !== 'GOOD').length;
    if (faultCount === 0) {
      this.combatEquipment.weapon = 'GOOD';
    } else if (faultCount === 1) {
      this.combatEquipment.weapon = 'POOR';
    } else {
      this.combatEquipment.weapon = 'UNABLE';
    }
  }

  public canFireMissile(): boolean {
    if (!this.canEquipMissile()) return false;
    return this.missileAmmo > 0 && this.weaponStatus.missile !== 'UNABLE';
  }

  public canFireLaser(): boolean {
    return this.laserAmmo > 0 && this.weaponStatus.laser !== 'UNABLE';
  }
}
