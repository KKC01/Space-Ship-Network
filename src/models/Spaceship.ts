import { DataPacket, PacketType, FreqShort, FreqLong } from './DataPacket';

export class Spaceship {
  public id: string;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  
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

  // 攻撃関連（隕石戦闘用）
  public attackTargetMeteorId: string | null = null;
  public attackCooldown: number = 0;
  public readonly ATTACK_RANGE: number = 400;
  public readonly ATTACK_DAMAGE: number = 25;
  public readonly ATTACK_COOLDOWN_MS: number = 1000;

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

  constructor(id: string, x: number, y: number, level: number = 1) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.level = level;
  }

  public update(dt: number, allShips?: Map<string, Spaceship>, onPoll?: (node: Spaceship, target: Spaceship) => void) {
    const dtSeconds = dt / 1000;
    
    if (this.targetX !== null && this.targetY !== null) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist > 2) {
        this.vx = (dx / dist) * this.MAX_SPEED;
        this.vy = (dy / dist) * this.MAX_SPEED;
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
}
