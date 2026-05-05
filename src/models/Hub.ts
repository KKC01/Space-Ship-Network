import { Spaceship } from './Spaceship';
import { DataPacket, PacketType, FreqShort, FreqLong } from './DataPacket';

export class Hub {
  public id: string;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public targetX: number | null = null;
  public targetY: number | null = null;
  public readonly MAX_SPEED = 20; // Slower than ships
  
  public isShortEnabled: boolean = true;
  public shortFreq: FreqShort = 'A';
  public isLongEnabled: boolean = false;
  public longFreq: FreqLong = 'D';
  
  public rgrStatus: Map<string, any> = new Map();
  public queue: DataPacket[] = [];
  
  public hp: number = 200; // Hubs have more HP
  public maxHp: number = 200;
  public lastReceivedSourceId: string | null = null;
  public lastReceivedAt: number = 0;

  // Transition logic
  public isTransitioning: boolean = false;
  public transitionTimer: number = 0;
  public oldShortFreq: FreqShort | null = null;
  public oldLongFreq: FreqLong | null = null;
  public oldIsShortEnabled: boolean = false;
  public oldIsLongEnabled: boolean = false;
  private readonly TRANSITION_DURATION_MS = 10000; // 10 seconds transition
  
  public pollingList: string[] = [];
  public currentPollingIndex: number = 0;
  
  private pollingTimer: number = 0;
  private static readonly POLLING_DELAY_MS = 200; // 1/3 speed (original ~67ms)

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }
  
  public broadcastFreqChange(payload: any) {
    // Start transition
    this.isTransitioning = true;
    this.transitionTimer = this.TRANSITION_DURATION_MS;
    
    // Store current state as "old"
    this.oldShortFreq = this.shortFreq;
    this.oldLongFreq = this.longFreq;
    this.oldIsShortEnabled = this.isShortEnabled;
    this.oldIsLongEnabled = this.isLongEnabled;

    // Apply new state to "active"
    if (payload.isShortEnabled !== undefined) this.isShortEnabled = payload.isShortEnabled;
    if (payload.shortFreq) this.shortFreq = payload.shortFreq;
    if (payload.isLongEnabled !== undefined) this.isLongEnabled = payload.isLongEnabled;
    if (payload.longFreq) this.longFreq = payload.longFreq;
    
    this.rgrStatus.clear();
    
    this.queue.push({
      id: `cmd-${Date.now()}`,
      type: PacketType.FREQ_CHANGE,
      createdAt: Date.now(),
      originShipId: this.id,
      payload
    });
  }

  public getNextPollingTarget(): string | null {
    if (this.pollingList.length === 0) return null;
    return this.pollingList[this.currentPollingIndex];
  }

  public update(dt: number, spaceships: Map<string, Spaceship>, onPollComplete: (hub: Hub, target: Spaceship) => void) {
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
    
    if (this.isTransitioning) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        this.isTransitioning = false;
        this.oldShortFreq = null;
        this.oldLongFreq = null;
      }
    }
    
    const now = Date.now();
    this.queue = this.queue.filter(p => (now - p.createdAt) < 90000);

    if (this.pollingList.length > 0) {
      this.pollingTimer -= dt;
      if (this.pollingTimer <= 0) {
        const targetId = this.getNextPollingTarget();
        if (targetId) {
          const targetShip = spaceships.get(targetId);
          if (targetShip) {
            onPollComplete(this, targetShip);
          }
        }
        
        this.currentPollingIndex = (this.currentPollingIndex + 1) % this.pollingList.length;
        this.pollingTimer = this.POLLING_DELAY_MS;
      }
    }
  }
}
