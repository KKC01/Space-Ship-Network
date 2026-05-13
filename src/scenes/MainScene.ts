import { Scene } from 'phaser';
import { Spaceship } from '../models/Spaceship';
import { PacketType, SystemDisplayMode } from '../models/DataPacket';
import { CommunicationSystem } from '../models/CommunicationSystem';
import { OpticalMaster } from '../models/OpticalMaster';
import { MeteorSystem } from '../systems/MeteorSystem';
import { PlanetSystem } from '../systems/PlanetSystem';
import { UIManager } from '../ui/UIManager';
import planetImg from '../assets/Planet_01.png';
import meteorImg from '../assets/meteor/meteor_01.png';

export class MainScene extends Scene {
  // 隕石サブシステム（MeteorSystem からアクセスされるため public）
  public spaceships: Map<string, Spaceship> = new Map();
  private opticalMasters: OpticalMaster[] = [];

  public shipGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private linkGraphics!: Phaser.GameObjects.Graphics;
  private clutterGraphics!: Phaser.GameObjects.Graphics;
  private interferenceGraphics!: Phaser.GameObjects.Graphics;

  public textLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  // サブシステム（他システムから参照されるため public）
  private meteorSystem!: MeteorSystem;
  public planetSystem!: PlanetSystem;
  private uiManager!: UIManager;

  // DOM 要素は各 System / UIManager 内で管理

  private timeElapsedMs: number = 0;
  private isGameOver: boolean = false;
  private isBriefingActive: boolean = true;
  public systemDisplayMode: SystemDisplayMode = SystemDisplayMode.CONTROL;
  public selectedAction: 'attack' | 'jamming' | 'warning' = 'attack';
  public vizMode: 'dots' | 'circles' | 'quality' | 'range' = 'circles';
  
  
  private surveyPoint = { x: 3000, y: 3000, radius: 200 };

  // 惑星（環境ハザード）状態は PlanetSystem 内で管理

  // 隕石（メテオ）状態は MeteorSystem 内で管理

  public selectedUnitId: string | null = null;

  // チャットウィジェット連携用：ミッション達成状況のキャッシュ
  private _missionReach: boolean = false;
  private _missionAllLinked: boolean = false;
  private _missionData: boolean = false;
  private _gameStateTickCounter: number = 0;
  private activePolls: {
    hubId: string, 
    targetId: string, 
    startTime: number, 
    callReached: boolean, 
    responseStarted: boolean,
    distance: number,
    isBroadcast?: boolean,
    rangeMode?: 'short' | 'long' | 'optical'
  }[] = [];
  
  // Link history: Key is "id1-id2", value is timestamp of last success
  private lastLinkSuccess: Map<string, number> = new Map();

  // Camera Pan
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private camStartX: number = 0;
  private camStartY: number = 0;
  private isDragging: boolean = false;

  // LV1 Features
  private interferenceZones: { x: number, y: number, radius: number }[] = [];
  private clutters: { x: number, y: number }[] = [];

  constructor() {
    super('MainScene');
  }

  preload() {
    // 惑星画像を Phaser テクスチャとして読み込み
    this.load.image('planet', planetImg);
    // 隕石画像を Phaser テクスチャとして読み込み
    this.load.image('meteor', meteorImg);
  }

  create() {
    this.cameras.main.setBackgroundColor('#020617');
    this.interferenceGraphics = this.add.graphics().setDepth(1);
    this.clutterGraphics = this.add.graphics().setDepth(2);
    this.linkGraphics = this.add.graphics().setDepth(3);

    // サブシステム初期化（DOM・Graphics は各システム内で生成）
    this.meteorSystem = new MeteorSystem(this);
    this.meteorSystem.init();
    this.planetSystem = new PlanetSystem(this);
    // 惑星配置は cx/cy が必要なので initGameData() 内で init() を呼ぶ
    this.uiManager = new UIManager(this);
    this.uiManager.init();

    this.initGameData();

    // Camera Setup - Unified
    const cx = this.sys.game.canvas.width / 2;
    const cy = this.sys.game.canvas.height / 2;
    // ユニット初期位置のオフセットに合わせて bounds を拡張（クランプ回避）
    this.cameras.main.setBounds(-6000, -6000, 12000, 12000);
    this.cameras.main.setZoom(0.4); // Doubled from 0.2 for better initial detail
    // ユニット群を画面右側に表示してミッションパネル（左上）との重なりを回避
    this.cameras.main.centerOn(cx - 3200 - 250, cy - 3200);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
      let newZoom = this.cameras.main.zoom - (deltaY * 0.001);
      newZoom = Phaser.Math.Clamp(newZoom, 0.15, 4.0); // Balanced range
      this.cameras.main.setZoom(newZoom);
    });
  }

  private initGameData() {
    const cx = this.sys.game.canvas.width / 2;
    const cy = this.sys.game.canvas.height / 2;

    const shipCount = 4;
    const SPAWN_OFFSET_X = -3200;
    const SPAWN_OFFSET_Y = -3200;
    for (let i = 0; i < shipCount; i++) {
      const id = i === 0 ? 'HQ Ship' : `Ship-${i}`;
      // Specific initial formation around HQ
      const x = (i === 0 ? cx : cx + (i === 1 ? -400 : (i === 2 ? 400 : 0))) + SPAWN_OFFSET_X;
      const y = (i === 0 ? cy : cy + (i === 3 ? 500 : 200)) + SPAWN_OFFSET_Y;
      const ship = new Spaceship(id, x, y, 1);
      
      if (i === 0) {
        ship.isNodeActive = true;
        ship.pollingList = ['Ship-1', 'Ship-2', 'Ship-3'];
      }
      this.spaceships.set(id, ship);
    }

    // Initialize Optical Masters
    this.opticalMasters.push(new OpticalMaster('Master-Alpha', cx - 1000, cy - 1000));
    this.opticalMasters.push(new OpticalMaster('Master-Beta', cx + 1000, cy + 1000));

    for (const id of this.spaceships.keys()) {
      const g = this.add.graphics().setDepth(5);
      this.shipGraphics.set(id, g);
      this.textLabels.set(id, this.add.text(0, 0, '', { fontSize: '12px', color: '#fff', fontFamily: 'Rajdhani' }).setDepth(10));
    }

    // New Clustered Clutter Logic
    this.interferenceZones = []; 
    this.clutters = [];
    const clusterCount = 10;
    for (let i = 0; i < clusterCount; i++) {
      const cX = cx + (Math.random() - 0.5) * 8000;
      const cY = cy + (Math.random() - 0.5) * 8000;
      const density = Math.floor(Math.random() * 50) + 30;
      const spread = Math.random() * 1200 + 600;

      for (let j = 0; j < density; j++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.pow(Math.random(), 2.5) * spread; 
        this.clutters.push({ 
          x: cX + Math.cos(angle) * dist, 
          y: cY + Math.sin(angle) * dist 
        });
      }
      // Use interferenceZones as "haze" markers for drawing
      this.interferenceZones.push({ x: cX, y: cY, radius: spread * 1.1 });
    }

    // 惑星をランダムに2つ配置（環境ハザード：通信干渉源）
    this.planetSystem.init(cx, cy, this.surveyPoint);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.isGameOver) return;
    this.isDragging = true;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.camStartX = this.cameras.main.scrollX;
    this.camStartY = this.cameras.main.scrollY;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.isDragging) {
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      this.cameras.main.scrollX = this.camStartX - dx / this.cameras.main.zoom;
      this.cameras.main.scrollY = this.camStartY - dy / this.cameras.main.zoom;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    this.isDragging = false;
    if (this.isGameOver) return;

    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      // 惑星クリック判定（PlanetSystem に委譲）
      if (this.planetSystem.handleClick(worldX, worldY)) {
        return;
      }

      // 隕石クリック判定（MeteorSystem に委譲）
      if (this.meteorSystem.handleClick(worldX, worldY)) {
        return;
      }

      let clickedId: string | null = null;
      let minDist = 30;

      for (const [id, ship] of this.spaceships.entries()) {
        const d = CommunicationSystem.getDistance(worldX, worldY, ship.x, ship.y);
        if (d < minDist) { minDist = d; clickedId = id; }
      }

      if (clickedId) {
        this.selectedUnitId = clickedId;
        this.uiManager.openUnit();
      } else {
        if (this.selectedUnitId) {
          const ship = this.spaceships.get(this.selectedUnitId);
          if (ship) { ship.targetX = worldX; ship.targetY = worldY; }
        } else {
          this.uiManager.closeUnitModal();
        }
      }
    }
  }


  public toggleNode(id: string) {
    const ship = this.spaceships.get(id);
    if (ship) {
      ship.isNodeActive = !ship.isNodeActive;
      if (ship.isNodeActive) {
        // Populate polling list with all other ships to start communication
        ship.pollingList = Array.from(this.spaceships.keys()).filter(key => key !== id);
        this.showFloatingText(ship.x, ship.y, 'ノード有効化', '#38bdf8');
      } else {
        this.showFloatingText(ship.x, ship.y, 'ノード解除', '#94a3b8');
      }
      this.uiManager.updateActiveModalDataIfOpen();
    }
  }

  private recordLinkSuccess(id1: string, id2: string) {
    const key = [id1, id2].sort().join('-');
    this.lastLinkSuccess.set(key, this.timeElapsedMs);
  }

  update(time: number, delta: number) {
    if (this.isGameOver || this.isBriefingActive) return;

    this.timeElapsedMs += delta;

    // 隕石の更新（spawn / 探知 / 衝突 / 戦闘）は MeteorSystem に委譲
    this.meteorSystem.update(delta, time);

    // 惑星の移動更新は PlanetSystem に委譲
    this.planetSystem.update(delta);

    for (const ship of this.spaceships.values()) {
      ship.update(delta, this.spaceships, (node, target) => this.handlePolling(node, target));

      // TDMA Logic
      if (ship.isMultiplexEnabled && ship.selectedMasterId) {
        let m = this.opticalMasters.find(om => om.id === ship.selectedMasterId);
        
        // Dynamically create master logic if it doesn't exist
        if (!m) {
          m = new OpticalMaster(ship.selectedMasterId, 0, 0); // Position doesn't matter
          this.opticalMasters.push(m);
        }

        if (m) {
          const currentSlot = m.getCurrentSlotIndex(this.timeElapsedMs / 1000);
          
          // Auto-assign multiple slots to fill the frame if not assigned
          if (ship.assignedSlots.length === 0) {
            const shipIndex = Array.from(this.spaceships.keys()).indexOf(ship.id);
            const totalShips = this.spaceships.size;
            if (totalShips > 0) {
              const slotsPerShip = Math.floor(OpticalMaster.MAX_SLOTS / totalShips);
              const mySlots: number[] = [];
              for (let i = 0; i < slotsPerShip; i++) {
                mySlots.push(shipIndex + (i * totalShips));
              }
              ship.assignedSlots = mySlots;
            }
          }

          if (ship.assignedSlots.includes(currentSlot)) {
            if (ship.lastTransmittedSlot !== currentSlot) {
              ship.lastTransmittedSlot = currentSlot;
              // It's our slot! Try to transmit
              this.handleOpticalTransmission(ship);
            }
          }
        }
      }
    }

    if (Math.floor(time) % 10 === 0) {
      this.uiManager.updateActiveModalDataIfOpen();
    }

    // Old hub labels removed as we use spaceships now

    const isCombat = this.systemDisplayMode === SystemDisplayMode.COMBAT;
    for (const [id, s] of this.spaceships.entries()) {
      const text = this.textLabels.get(id);
      const isHQ = (id === 'HQ Ship');
      if (text) {
        if (isCombat) {
          text.setText(id);
        } else {
          const statusStr = s.pendingFreqChange ? ' [SETTING...]' : '';
          text.setText(`${id}${statusStr}`);
        }
        text.setPosition(s.x, s.y + (isHQ ? 55 : 40));
        if (isHQ) {
          text.setColor('#ffffff');
        } else {
          text.setColor(s.pendingFreqChange ? '#fbbf24' : (s.queue.length > 0 ? '#38bdf8' : '#f8fafc'));
        }
        text.setBackgroundColor('rgba(15, 23, 42, 0.85)');
        text.setPadding(6, 4);
      }
    }

    this.uiManager.updateTimeDisplay(this.timeElapsedMs, 1);
    this.uiManager.updateScaleBar(this.cameras.main.zoom);

    this.draw(time);
    
    // 2. Update Active Polls Logic (Scanlines)
    const waveSpeed = 750; 

    for (let i = this.activePolls.length - 1; i >= 0; i--) {
      const poll = this.activePolls[i];
      const elapsed = this.timeElapsedMs - poll.startTime;
      const waveDist = elapsed * (waveSpeed / 1000);
      
      const node = this.spaceships.get(poll.hubId);
      const target = this.spaceships.get(poll.targetId);

      if (!node || !target) {
        if (!poll.isBroadcast && node) {
          node.isWaitingForResponse = false;
        }
        this.activePolls.splice(i, 1);
        continue;
      }

      const maxRange = poll.rangeMode === 'long' ? 2500 : 750;

      // 1. Outward Call Pulse
      if (!poll.callReached && waveDist >= poll.distance) {
        poll.callReached = true;
        poll.responseStarted = true;
        
        // Data exchange logic
        const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);
        const packetsToTx = target.getPacketsToTransmit();
        const successfulPackets = CommunicationSystem.transferData(target, node, packetsToTx, activeNodes, this.planetSystem.getPlanets());
        if (successfulPackets.length > 0) {
          successfulPackets.forEach(p => node.receivePacket(p));
          this.showFloatingText(node.x, node.y, 'データ受信', '#4ade80');
          this.recordLinkSuccess(node.id, target.id);
        }
        const nodePackets = node.queue;
        const successfulNodePackets = CommunicationSystem.transferData(node, target, nodePackets, activeNodes, this.planetSystem.getPlanets());
        if (successfulNodePackets.length > 0) {
          successfulNodePackets.forEach(p => {
            target.receivePacket(p);
          });
          this.recordLinkSuccess(node.id, target.id);
        }
      }

      // 2. Returning/Broadcasting Wave
      if (poll.responseStarted) {
        const resElapsed = elapsed - (poll.distance / (waveSpeed / 1000));
        const resWaveDist = resElapsed * (waveSpeed / 1000);
        const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);

        // DATA BROADCAST: Any ship hit by the expanding gold wave receives data
        this.spaceships.forEach(nearbyShip => {
           if (nearbyShip.id === target.id) return; // Already exchanged
           const d = CommunicationSystem.getDistance(target.x, target.y, nearbyShip.x, nearbyShip.y);
           // Check if wave just hit this ship
           if (Math.abs(resWaveDist - d) < (waveSpeed * delta / 1000) * 1.5) {
             const packets = target.getPacketsToTransmit();
             const successful = CommunicationSystem.transferData(target, nearbyShip, packets, activeNodes, this.planetSystem.getPlanets());
             if (successful.length > 0) {
               successful.forEach(p => nearbyShip.receivePacket(p));
               this.recordLinkSuccess(target.id, nearbyShip.id);
             }
           }
        });
        
        // Remove and Trigger next poll ONLY when wave reaches max range (to ensure no overlap)
        if (resWaveDist >= maxRange) {
          if (!poll.isBroadcast && node) {
            node.isWaitingForResponse = false;
          }
          this.activePolls.splice(i, 1);
        }
      }
    }

    this.checkWinLoss();

    // 経過時間表示の更新（整数秒）
    this.uiManager.updateTimeDisplay(this.timeElapsedMs, 0);

    // 60フレームに1回（≒1秒）ゲーム状態を window.__gameState に書き出し（チャット用）
    this._gameStateTickCounter++;
    if (this._gameStateTickCounter % 60 === 0) {
      this.exposeGameState();
    }
  }

  private handlePolling(node: Spaceship, target: Spaceship) {
    const dist = CommunicationSystem.getDistance(node.x, node.y, target.x, target.y);
    const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);

    // 1. CMD packets use a separate command channel — delivered regardless of frequency
    const cmdPackets = node.queue.filter(p => p.type === PacketType.CMD);
    if (cmdPackets.length > 0) {
      const maxCmdRange = (node.isLongEnabled || target.isLongEnabled) ? 2500 : 750;
      if (dist <= maxCmdRange) {
        cmdPackets.forEach(p => {
          // Only deliver if target hasn't received this CMD yet
          if (!target.queue.some(q => q.id === p.id)) {
            target.receivePacket(p);
            this.showFloatingText(target.x, target.y, '指令受信', '#f59e0b');
          }
        });
      }
    }

    // 2. Normal communication requires matching frequencies
    const { canConnect } = CommunicationSystem.getLinkQuality(node, target, activeNodes, this.planetSystem.getPlanets());
    
    if (canConnect) {
      const rangeMode = (node.isLongEnabled && target.isLongEnabled && node.longFreq === target.longFreq) ? 'long' : 'short';
      this.activePolls.push({
        hubId: node.id,
        targetId: target.id,
        startTime: this.timeElapsedMs,
        callReached: false,
        responseStarted: false,
        distance: dist,
        rangeMode
      });
    } else {
      // No frequency match — no wave animation, node moves on to next target
      node.isWaitingForResponse = false;
    }
  }

  private handleOpticalTransmission(ship: Spaceship) {
    let transmissionOccurred = false;

    // Find targets within 750km (Optical range)
    this.spaceships.forEach(target => {
      if (target.id === ship.id) return;
      
      const { canConnect, dropRate } = CommunicationSystem.getOpticalMultiplexQuality(ship, target, Array.from(this.spaceships.values()).filter(s => s.isNodeActive));
      
      if (canConnect && Math.random() >= dropRate) {
        transmissionOccurred = true;
        // Even if queue is empty, we send a heartbeat for visual connection
        const packetsToTransmit = ship.getPacketsToTransmit();
        const packets = packetsToTransmit.length > 0 ? packetsToTransmit.map(p => ({
          ...p,
          payload: { ...p.payload, isOptical: true, cipher: ship.multiplexCipher }
        })) : [{
          id: `heartbeat-${Date.now()}-${ship.id}`,
          type: PacketType.NORMAL,
          createdAt: Date.now(),
          originShipId: ship.id,
          payload: { isOptical: true, isHeartbeat: true }
        }];
        
        packets.forEach(p => target.receivePacket(p as any));
        this.recordLinkSuccess(ship.id, target.id);
      }
    });

    if (transmissionOccurred) {
      // Trigger visual effect (Single broadcast poll for the sender)
      this.activePolls.push({
        hubId: ship.id,
        targetId: ship.id, // Use sender as target for broadcast center
        startTime: this.timeElapsedMs,
        callReached: true, 
        responseStarted: true,
        distance: 0,
        rangeMode: 'optical'
      });
    }
  }

  private draw(time: number) {
    this.linkGraphics.clear();
    this.linkGraphics.setBlendMode(Phaser.BlendModes.ADD);
    this.clutterGraphics.clear();
    this.interferenceGraphics.clear();
    this.meteorSystem.clearGraphics();

    // 0. Draw Clutter Haze (Fuzzy Boundaries)
    this.interferenceZones.forEach(zone => {
      this.interferenceGraphics.fillStyle(0x334155, 0.04);
      this.interferenceGraphics.fillCircle(zone.x, zone.y, zone.radius);
      this.interferenceGraphics.fillStyle(0x334155, 0.02);
      this.interferenceGraphics.fillCircle(zone.x, zone.y, zone.radius * 1.5);
    });

    // 0b. Draw Clutters
    this.clutters.forEach(c => {
      const size = Math.random() * 2 + 1;
      const alpha = Math.random() * 0.3 + 0.1;
      this.clutterGraphics.fillStyle(0x94a3b8, alpha);
      this.clutterGraphics.fillCircle(c.x, c.y, size);
    });

    // 0c. Optical Masters (Hidden from map as per request)

    // 1. Draw Survey Point (Yellow Circle) with expanding pulse motion
    const pulseRate = (time % 2000) / 2000;
    this.clutterGraphics.lineStyle(3, 0xeab308, 0.6);
    this.clutterGraphics.strokeCircle(this.surveyPoint.x, this.surveyPoint.y, this.surveyPoint.radius);
    this.clutterGraphics.fillStyle(0xeab308, 0.1);
    this.clutterGraphics.fillCircle(this.surveyPoint.x, this.surveyPoint.y, this.surveyPoint.radius);

    // Expanding motion pulse
    this.clutterGraphics.lineStyle(2, 0xeab308, 0.6 * (1 - pulseRate));
    this.clutterGraphics.strokeCircle(this.surveyPoint.x, this.surveyPoint.y, this.surveyPoint.radius + (pulseRate * 100));
    
    const surveyText = this.textLabels.get('survey-point-label') || this.add.text(this.surveyPoint.x, this.surveyPoint.y - this.surveyPoint.radius - 30, '調査対象ポイント', { fontSize: '18px', color: '#eab308', fontFamily: 'Rajdhani', fontStyle: 'bold' }).setOrigin(0.5).setDepth(20);
    this.textLabels.set('survey-point-label', surveyText);
    surveyText.setPosition(this.surveyPoint.x, this.surveyPoint.y - this.surveyPoint.radius - 30);

    // 1b. 惑星の干渉ゾーン（通信品質モード時のみ表示）→ PlanetSystem に委譲
    if (this.vizMode === 'quality') {
      this.planetSystem.drawInterferenceZones(this.clutterGraphics);
    }

    const isControl = this.systemDisplayMode === SystemDisplayMode.CONTROL;
    const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);

    // 2. Draw Units
    this.spaceships.forEach(ship => {
      const g = this.shipGraphics.get(ship.id);
      if (!g) return;
      g.clear();

      const isSelected = this.selectedUnitId === ship.id;
      const isHQ = ship.id === 'HQ Ship';
      const primaryColor = 0x38bdf8; // Cyan
      const accentColor = 0x38bdf8; // Unified color
      
      let angle = 0;
      if (ship.vx !== 0 || ship.vy !== 0) {
        angle = Math.atan2(ship.vy, ship.vx);
      } else if (ship.targetX !== null && ship.targetY !== null) {
        angle = Math.atan2(ship.targetY - ship.y, ship.targetX - ship.x);
      }

      // Selection Pulse: 選択中ユニットをパルス表示（両モード共通）
      if (isSelected) {
        const pulse = (Math.sin(time / 500) + 1) / 2;
        g.lineStyle(2, primaryColor, 0.4 + pulse * 0.4);
        g.strokeCircle(ship.x, ship.y, 25 + pulse * 10);
      }

      // Background Glow for Visibility
      g.fillStyle(primaryColor, 0.05);
      g.fillCircle(ship.x, ship.y, isHQ ? 45 : 30);
      g.lineStyle(1, primaryColor, 0.1);
      g.strokeCircle(ship.x, ship.y, isHQ ? 45 : 30);

      if (isHQ) {
        // Special HQ Destroyer Shape
        g.lineStyle(2, accentColor, 1);
        g.fillStyle(primaryColor, 0.2);
        const size = 20;
        
        const p1x = ship.x + size * 2.0 * Math.cos(angle);
        const p1y = ship.y + size * 2.0 * Math.sin(angle);
        const p2x = ship.x + size * Math.cos(angle + 2.5);
        const p2y = ship.y + size * Math.sin(angle + 2.5);
        const p3x = ship.x + (size * 0.6) * Math.cos(angle + Math.PI);
        const p3y = ship.y + (size * 0.6) * Math.sin(angle + Math.PI);
        const p4x = ship.x + size * Math.cos(angle - 2.5);
        const p4y = ship.y + size * Math.sin(angle - 2.5);

        g.beginPath();
        g.moveTo(p1x, p1y);
        g.lineTo(p2x, p2y);
        g.lineTo(p3x, p3y);
        g.lineTo(p4x, p4y);
        g.closePath();
        g.fillPath();
        g.strokePath();

        // Sub-details for HQ
        g.lineStyle(1, accentColor, 0.6);
        g.lineBetween(ship.x, ship.y, p1x, p1y);
      } else {
        // Simple Tactical Triangle for Normal Ships
        g.lineStyle(2, accentColor, 1);
        if (ship.isNodeActive && isControl) g.fillStyle(primaryColor, 0.3);
        const size = 12;
        const p1x = ship.x + size * 1.5 * Math.cos(angle);
        const p1y = ship.y + size * 1.5 * Math.sin(angle);
        const p2x = ship.x + size * Math.cos(angle + 2.6);
        const p2y = ship.y + size * Math.sin(angle + 2.6);
        const p3x = ship.x + size * Math.cos(angle - 2.6);
        const p3y = ship.y + size * Math.sin(angle - 2.6);

        g.beginPath();
        g.moveTo(p1x, p1y);
        g.lineTo(p2x, p2y);
        g.lineTo(p3x, p3y);
        g.closePath();
        if (ship.isNodeActive && isControl) g.fillPath();
        g.strokePath();
      }

      // Node core (always shows role but small)
      if (ship.isNodeActive) {
        g.fillStyle(0x38bdf8, isControl ? 1.0 : 0.4);
        g.fillCircle(ship.x, ship.y, 3);
      }

      // Selection Marker
      if (isSelected) {
        g.lineStyle(1, 0xfacc15, 0.4);
        const s = isHQ ? 40 : 25;
        g.strokeRect(ship.x - s/2, ship.y - s/2, s, s);
      }

      // HP Bar
      const hpPercent = ship.hp / ship.maxHp;
      g.fillStyle(0x000000, 0.5);
      g.fillRect(ship.x - 20, ship.y - 35, 40, 4);
      g.fillStyle(hpPercent < 0.3 ? 0xef4444 : 0x4ade80, 0.8);
      g.fillRect(ship.x - 20, ship.y - 35, 40 * hpPercent, 4);
      
      // Data Bar (New)
      const dataPercent = Math.min(1.0, ship.queue.length / 10);
      g.fillStyle(0x000000, 0.5);
      g.fillRect(ship.x - 20, ship.y - 30, 40, 4);
      g.fillStyle(0x38bdf8, 0.8);
      g.fillRect(ship.x - 20, ship.y - 30, 40 * dataPercent, 4);

      // Proximity Warning Check
      let isTooClose = false;
      this.spaceships.forEach(other => {
        if (other.id === ship.id) return;
        const d = CommunicationSystem.getDistance(ship.x, ship.y, other.x, other.y);
        if (d < 150) isTooClose = true;
      });

      const warningLabelId = `warning-${ship.id}`;
      if (isTooClose) {
        // Red Pulse Glow
        const pulse = (Math.sin(time / 200) + 1) / 2;
        g.lineStyle(3, 0xef4444, 0.5 + pulse * 0.5);
        g.strokeCircle(ship.x, ship.y, isHQ ? 50 : 35);
        
        if (!this.textLabels.has(warningLabelId)) {
          this.textLabels.set(warningLabelId, this.add.text(ship.x, ship.y - 50, 'WARNING', { fontSize: '12px', color: '#ef4444', fontStyle: 'bold', fontFamily: 'Rajdhani' }).setOrigin(0.5).setDepth(20));
        } else {
          this.textLabels.get(warningLabelId)?.setPosition(ship.x, ship.y - 50).setVisible(true);
        }
      } else {
        this.textLabels.get(warningLabelId)?.setVisible(false);
      }
    });

    // 1. Draw Individual Ship Range Circles (control mode only)
    this.spaceships.forEach(ship => {
      const g = this.shipGraphics.get(ship.id);
      if (!g) return;
      if (!isControl) return;

      const isSelected = ship.id === this.selectedUnitId;
      // サークル/ライン表示: 選択ユニットのみ表示
      // 通信品質: 全ユニット表示
      const showCircle = this.vizMode === 'quality' || isSelected;
      if (showCircle) {
        g.lineStyle(1, 0x38bdf8, 0.4);
        g.strokeCircle(ship.x, ship.y, 750);
        g.lineStyle(1, 0x38bdf8, 0.15);
        g.strokeCircle(ship.x, ship.y, 2500);
      }
    });

    // 2. Draw Links (Background connections) — control mode only
    if (isControl) this.spaceships.forEach(source => {
      this.spaceships.forEach(target => {
        if (source.id < target.id) {
          const { canConnect: canStandard, dropRate: standardRate } = CommunicationSystem.getLinkQuality(source, target, activeNodes, this.planetSystem.getPlanets());
          const { canConnect: canOpt } = CommunicationSystem.getOpticalMultiplexQuality(source, target, activeNodes);

          // Calculate perpendicular vector for offset
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          const nx = -dy / len;
          const ny = dx / len;
          const offset = 1.2; // Narrower gap for background lines

          // Standard Radio/Optical Link (Yellow/Red in all modes, Blue in Quality)
          if (canStandard) {
            let color = 0x4ade80; 
            let alpha = 0.15;
            if (this.vizMode === 'quality') {
              color = 0x38bdf8; // Blue
              alpha = 0.3;
            } else {
              if (standardRate > 0.8) color = 0xef4444;
              else if (standardRate > 0.4) color = 0xfacc15;
            }
            this.linkGraphics.lineStyle(1, color, alpha);
            const ox = this.vizMode === 'quality' ? nx * -offset : 0;
            const oy = this.vizMode === 'quality' ? ny * -offset : 0;
            this.linkGraphics.lineBetween(source.x + ox, source.y + oy, target.x + ox, target.y + oy);
          }

          // Multiplex Link (Purple) - ONLY in quality mode for background
          if (this.vizMode === 'quality' && canOpt) {
            this.linkGraphics.lineStyle(1, 0xa855f7, 0.4);
            const ox = nx * offset;
            const oy = ny * offset;
            this.linkGraphics.lineBetween(source.x + ox, source.y + oy, target.x + ox, target.y + oy);
          }
        }
      });
    });

    // 3. Draw Communication (Control mode only)
    if (isControl) {
      activeNodes.forEach(node => {
        this.spaceships.forEach(target => {
          if (node.id === target.id) return;
          const { canConnect, dropRate } = CommunicationSystem.getLinkQuality(node, target, activeNodes, this.planetSystem.getPlanets());
          if (canConnect) {
            // Background thin link
            this.linkGraphics.lineStyle(1, 0x4ade80, (1 - dropRate) * 0.05);
            this.linkGraphics.lineBetween(node.x, node.y, target.x, target.y);
          }
        });
      });

      const waveSpeed = 750;
      const drawnCircleHubs = new Set<string>();
      
      this.activePolls.forEach(poll => {
        const hub = this.spaceships.get(poll.hubId);
        const target = this.spaceships.get(poll.targetId);
        if (!hub || !target) return;

        const elapsed = this.timeElapsedMs - poll.startTime;
        const waveDist = elapsed * (waveSpeed / 1000);

        // A. Call Streamline (Hub -> Target)
        if (!poll.callReached) {
          const t = Math.min(1.0, waveDist / poll.distance);
          this.drawStreamline(hub.x, hub.y, target.x, target.y, t, 0x38bdf8);
        }

        // B. Response
        if (poll.responseStarted) {
          const resElapsed = elapsed - (poll.distance / (waveSpeed / 1000));
          const resWaveDist = resElapsed * (waveSpeed / 1000);
          
          let maxRange = 750;
          if (poll.rangeMode === 'long') maxRange = 2500;
          if (poll.rangeMode === 'optical') maxRange = 750;

          if (resWaveDist > 0 && resWaveDist <= maxRange) {
            const motionColor = poll.rangeMode === 'optical' ? 0xa855f7 : 0x38bdf8; // Purple for Multiplex, Blue for Standard
            if (this.vizMode === 'circles') {
              // Circle Mode: Expanding Wave (Double circle)
              // Ensure only one double-circle is drawn per hub to prevent overlapping clutter
              const hubId = poll.rangeMode === 'optical' ? hub.id : target.id;
              if (!drawnCircleHubs.has(hubId)) {
                drawnCircleHubs.add(hubId);
                const alpha = Math.max(0, 0.6 * (1 - resWaveDist / maxRange));
                const centerX = poll.rangeMode === 'optical' ? hub.x : target.x;
                const centerY = poll.rangeMode === 'optical' ? hub.y : target.y;
                
                this.linkGraphics.lineStyle(2, motionColor, alpha);
                this.linkGraphics.strokeCircle(centerX, centerY, resWaveDist);
                
                if (poll.rangeMode === 'optical' && resWaveDist > 30) {
                  this.linkGraphics.lineStyle(1, motionColor, alpha * 0.7);
                  this.linkGraphics.strokeCircle(centerX, centerY, resWaveDist - 30);
                }
              }
            } else if (this.vizMode === 'dots') {
              // Dot Mode: Multiple Streamlines
              const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);
              this.spaceships.forEach(nearbyShip => {
                // For Multiplex (broadcast poll), sender is hub. For standard, sender is target.
                const startNode = poll.rangeMode === 'optical' ? hub : target;
                if (nearbyShip.id === startNode.id) return; // Don't draw to self
                
                const d = CommunicationSystem.getDistance(startNode.x, startNode.y, nearbyShip.x, nearbyShip.y);
                
                const canConnect = poll.rangeMode === 'optical' 
                  ? CommunicationSystem.getOpticalMultiplexQuality(startNode, nearbyShip, activeNodes).canConnect
                  : (nearbyShip.id !== target.id && CommunicationSystem.getLinkQuality(target, nearbyShip, activeNodes, this.planetSystem.getPlanets()).canConnect);

                if (canConnect && resWaveDist <= d + 100) {
                  const t = Math.min(1.0, resWaveDist / d);
                  if (t > 0) {
                    if (poll.rangeMode === 'optical') {
                      this.drawFourDots(startNode.x, startNode.y, nearbyShip.x, nearbyShip.y, t, motionColor);
                    } else {
                      this.drawStreamline(startNode.x, startNode.y, nearbyShip.x, nearbyShip.y, t, motionColor);
                    }
                  }
                }
              });
            }
          }
        }
      });
    }

    // 4. Draw Communication Quality Overlay (Reverted to Selected Source Centric)
    if (this.vizMode === 'quality' && this.selectedUnitId) {
      const source = this.spaceships.get(this.selectedUnitId);
      const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);
      
      if (source) {
        this.spaceships.forEach(target => {
          if (source.id === target.id) return;

          const { canConnect, dropRate } = CommunicationSystem.getLinkQuality(source, target, activeNodes, this.planetSystem.getPlanets());
          
          // Check if there's a recent CMD success (Emergency path)
          const key = [source.id, target.id].sort().join('-');
          const lastTime = this.lastLinkSuccess.get(key);
          const isCommandPath = lastTime && (this.timeElapsedMs - lastTime) < 5000;
          
          if (canConnect || isCommandPath) {
            let color = 0x38bdf8; // Blue (Standard Optical)
            if (isCommandPath && !canConnect) color = 0xfbbf24; // Amber (CMD Path)
            else if (dropRate > 0.5) color = 0xef4444; // Red (Poor)
            else if (dropRate > 0.2) color = 0xfacc15; // Yellow (Good)
            
            // Calculate perpendicular vector for offset
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            const nx = -dy / len;
            const ny = dx / len;
            const offset = 2.5; // Narrower gap

            // Quality lines for selected unit (Radio already handled, highlighting optical)
            const { canConnect: canOpt, dropRate: optDrop } = CommunicationSystem.getOpticalMultiplexQuality(source, target, activeNodes);
            if (canOpt) {
              this.linkGraphics.lineStyle(1, 0xa855f7, (1 - optDrop) * 0.8); // Thinner Purple (Multiplex)
              this.linkGraphics.lineBetween(source.x + nx * offset, source.y + ny * offset, target.x + nx * offset, target.y + ny * offset);
            }

            if (canConnect) {
              this.linkGraphics.lineStyle(1.5, color, 0.4); // Standard Optical
              this.linkGraphics.lineBetween(source.x - nx * offset, source.y - ny * offset, target.x - nx * offset, target.y - ny * offset);
            }
            
            // Text labels removed as per request
          }
        });
      }
    } else {
      // Hide all quality texts
      this.textLabels.forEach((txt, key) => {
        if (key.startsWith('quality-txt-')) txt.setVisible(false);
      });
    }

    // 5. Draw Range Overlay (Combat/射程 mode: 400km detection + 100km weapon range)
    if (this.vizMode === 'range') {
      this.spaceships.forEach(ship => {
        this.linkGraphics.lineStyle(1, 0xef4444, 0.6);
        this.linkGraphics.strokeCircle(ship.x, ship.y, 100);
        // 探知距離 400km を薄いオレンジで表示
        this.linkGraphics.lineStyle(1, 0xfb923c, 0.25);
        this.linkGraphics.strokeCircle(ship.x, ship.y, 400);
      });
    }

    // 6. Draw Meteors: MeteorSystem に委譲
    this.meteorSystem.draw(time);
  }

  private drawStreamline(startX: number, startY: number, endX: number, endY: number, progress: number, color: number) {
    const totalDist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const segmentLen = 5; // Shorter lines
    
    const headT = progress;
    const tailT = Math.max(0, headT - (segmentLen / totalDist));
    
    const headX = startX + (endX - startX) * headT;
    const headY = startY + (endY - startY) * headT;
    const tailX = startX + (endX - startX) * tailT;
    const tailY = startY + (endY - startY) * tailT;

    this.linkGraphics.lineStyle(2, color, 0.8);
    this.linkGraphics.lineBetween(tailX, tailY, headX, headY);
    // Removed the head dot to avoid looking like a ping/poll
  }

  private drawFourDots(startX: number, startY: number, endX: number, endY: number, progress: number, color: number) {
    const totalDist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    
    for (let i = 0; i < 4; i++) {
      const offset = (i * 20) / totalDist;
      const t = progress - offset;
      if (t >= 0 && t <= 1) {
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t;
        this.linkGraphics.fillStyle(color, 1.0 - (i * 0.2));
        this.linkGraphics.fillCircle(x, y, 2.5);
      }
    }
  }

  private checkWinLoss() {
    if (this.isGameOver) return;

    let reachSuccess = false;
    let allLinkedSuccess = true;
    let dataSuccess = false;

    const activeUnits = Array.from(this.spaceships.values());
    const hqNode = activeUnits.find(s => s.id === 'HQ Ship');
    const nodes = activeUnits.filter(s => s.isNodeActive);

    for (const ship of activeUnits) {
      // 1. Survey Point Reach
      const dist = CommunicationSystem.getDistance(ship.x, ship.y, this.surveyPoint.x, this.surveyPoint.y);
      if (dist < this.surveyPoint.radius) {
        reachSuccess = true;
        
        if (this.timeElapsedMs % 1000 < 20 && !ship.queue.some(p => p.type === PacketType.SURVEY_DATA)) {
          ship.receivePacket({
            id: `survey-${Date.now()}-${ship.id}`,
            type: PacketType.SURVEY_DATA,
            createdAt: Date.now(),
            originShipId: ship.id
          });
          this.showFloatingText(ship.x, ship.y, 'データ収集', '#eab308');
        }
      }

      // 2. All Linked Success (Must have connection to HQ)
      if (hqNode) {
        const { canConnect } = CommunicationSystem.getLinkQuality(ship, hqNode, nodes, this.planetSystem.getPlanets());
        if (!canConnect && ship.id !== hqNode.id) {
          allLinkedSuccess = false;
        }
      }
    }

    // 3. Survey Data recovered at HQ
    if (hqNode && hqNode.queue.some(p => p.type === PacketType.SURVEY_DATA)) {
      dataSuccess = true;
    }

    const mReach = document.getElementById('m-reach');
    const mAllLink = document.getElementById('m-all-link');
    const mData = document.getElementById('m-data');

    if (mReach) mReach.innerHTML = `<span class="check">${reachSuccess ? '[x]' : '[ ]'}</span> 調査対象ポイントへの到達`;
    if (mAllLink) mAllLink.innerHTML = `<span class="check">${allLinkedSuccess ? '[x]' : '[ ]'}</span> 全ユニットの通信確保`;
    if (mData) mData.innerHTML = `<span class="check">${dataSuccess ? '[x]' : '[ ]'}</span> 調査データの転送・回収`;

    // チャットウィジェット用キャッシュ
    this._missionReach = reachSuccess;
    this._missionAllLinked = allLinkedSuccess;
    this._missionData = dataSuccess;

    if (reachSuccess && allLinkedSuccess && dataSuccess) {
      this.win();
    }
  }

  // window.__gameState にゲーム状態を公開（チャットウィジェットがDifyへのコンテキストとして利用）
  private exposeGameState() {
    const selectedHp = this.selectedUnitId
      ? (this.spaceships.get(this.selectedUnitId)?.hp ?? null)
      : null;
    window.__gameState = {
      shipCount: this.spaceships.size,
      selectedUnitId: this.selectedUnitId,
      selectedUnitHp: selectedHp,
      missionReach: this._missionReach,
      missionAllLinked: this._missionAllLinked,
      missionData: this._missionData,
      elapsedSeconds: Math.floor(this.timeElapsedMs / 1000),
      gameMode: this.systemDisplayMode === SystemDisplayMode.CONTROL ? 'control' : 'combat',
      gameStatus: this.isBriefingActive ? 'briefing' : this.isGameOver ? 'won' : 'active',
    };
  }

  public lose() {
    this.isGameOver = true;
    if (window.__chatWidget) window.__chatWidget.disabled = true;
    this.uiManager.showGameOver('MISSION FAILED', '全部隊が消滅しました。');
  }

  private win() {
    this.isGameOver = true;
    this.uiManager.showGameOver('MISSION SUCCESS', '調査データをHQに回収し、全部隊の安全を確保しました。');
  }

  public showFloatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y - 20, text, { fontSize: '14px', color, fontFamily: 'Rajdhani', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      duration: 1500,
      onComplete: () => t.destroy()
    });
  }

  /**
   * 開く対象以外のモーダルを閉じる排他制御。
   * 各 System / UIManager の openXxx() 内から呼ぶ。
   */
  public closeOtherModals(except: 'unit' | 'planet' | 'meteor'): void {
    if (except !== 'unit') this.uiManager.closeUnitModal();
    if (except !== 'planet') this.planetSystem.closeModal();
    if (except !== 'meteor') this.meteorSystem.closeModal();
  }

  /**
   * UIManager のブリーフィング開始ボタンから呼ばれる。
   */
  public endBriefing(): void {
    this.isBriefingActive = false;
    console.log('Mission Started');
  }

}
