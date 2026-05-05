import { Scene } from 'phaser';
import { Spaceship } from '../models/Spaceship';
import { PacketType, FreqShort, FreqLong, SystemDisplayMode } from '../models/DataPacket';
import { CommunicationSystem } from '../models/CommunicationSystem';

export class MainScene extends Scene {
  private spaceships: Map<string, Spaceship> = new Map();

  private shipGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private linkGraphics!: Phaser.GameObjects.Graphics;
  private clutterGraphics!: Phaser.GameObjects.Graphics;
  private interferenceGraphics!: Phaser.GameObjects.Graphics;

  private textLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  // DOM Elements
  private domTime!: HTMLElement | null;
  private domCoverage!: HTMLElement | null;
  private domGameOver!: HTMLElement | null;
  private domGameTitle!: HTMLElement | null;
  private domGameDesc!: HTMLElement | null;

  // Unit Modal DOM Elements
  private domUnitModal!: HTMLElement | null;
  private domUnitTitle!: HTMLElement | null;
  private domUnitType!: HTMLElement | null;
  private domUnitLevel!: HTMLElement | null;
  private domUnitTargets!: HTMLElement | null;
  private domShortEnable!: HTMLInputElement | null;
  private domShortFreq!: HTMLSelectElement | null;
  private domLongEnable!: HTMLInputElement | null;
  private domLongFreq!: HTMLSelectElement | null;
  private domSendCmdBtn: HTMLElement | null = null;
  private domRgrContainer!: HTMLElement | null;
  private domRgrList!: HTMLElement | null;
  private domModalClose: HTMLElement | null = null;

  private domScaleBarLine!: HTMLElement | null;
  private domScaleBarText!: HTMLElement | null;

  private timeElapsedMs: number = 0;
  private isGameOver: boolean = false;
  private isBriefingActive: boolean = true;
  private systemDisplayMode: SystemDisplayMode = SystemDisplayMode.CONTROL;
  private vizMode: 'dots' | 'circles' | 'quality' | 'range' = 'circles';
  
  private detectionPacketId = 'detect-001';
  private surveyPoint = { x: 3000, y: 3000, radius: 200 };
  private missionStatus = { reach: false, link: false, data: false };
  
  private selectedUnitId: string | null = null;
  private responsePulses: {x: number, y: number, r: number, alpha: number}[] = [];
  private activePolls: {
    hubId: string, 
    targetId: string, 
    startTime: number, 
    callReached: boolean, 
    responseStarted: boolean,
    distance: number,
    isBroadcast?: boolean,
    rangeMode?: 'short' | 'long'
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

  create() {
    this.cameras.main.setBackgroundColor('#020617');
    this.interferenceGraphics = this.add.graphics().setDepth(1);
    this.clutterGraphics = this.add.graphics().setDepth(2);
    this.linkGraphics = this.add.graphics().setDepth(3);

    this.initDOM();
    this.initGameData();

    // Camera Setup - Unified
    const cx = this.sys.game.canvas.width / 2;
    const cy = this.sys.game.canvas.height / 2;
    this.cameras.main.setBounds(-4000, -4000, 8000, 8000);
    this.cameras.main.setZoom(0.4); // Doubled from 0.2 for better initial detail
    this.cameras.main.centerOn(cx, cy);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
      let newZoom = this.cameras.main.zoom - (deltaY * 0.001);
      newZoom = Phaser.Math.Clamp(newZoom, 0.15, 4.0); // Balanced range
      this.cameras.main.setZoom(newZoom);
    });
  }

  private initDOM() {
    this.domTime = document.getElementById('time-display');
    this.domCoverage = document.getElementById('coverage-display');
    this.domGameOver = document.getElementById('game-over-panel');
    this.domGameTitle = document.getElementById('game-over-title');
    this.domGameDesc = document.getElementById('game-over-desc');

    this.domUnitModal = document.getElementById('unit-modal');
    this.domUnitTitle = document.getElementById('unit-title');
    this.domUnitType = document.getElementById('unit-type');
    this.domUnitLevel = document.getElementById('unit-level');
    this.domUnitTargets = document.getElementById('unit-targets');
    this.domShortEnable = document.getElementById('short-enable') as HTMLInputElement;
    this.domShortFreq = document.getElementById('short-freq') as HTMLSelectElement;
    this.domLongEnable = document.getElementById('long-enable') as HTMLInputElement;
    this.domLongFreq = document.getElementById('long-freq') as HTMLSelectElement;
    
    const updateLocal = (e?: Event) => {
      // Only update if the event was triggered by actual user interaction
      if (e && e.isTrusted && this.selectedUnitId) {
        const ship = this.spaceships.get(this.selectedUnitId);
        if (ship) {
           ship.isShortEnabled = this.domShortEnable?.checked || false;
           ship.shortFreq = this.domShortFreq?.value as any;
           ship.isLongEnabled = this.domLongEnable?.checked || false;
           ship.longFreq = this.domLongFreq?.value as any;
        }
      }
    };

    if (this.domShortEnable) this.domShortEnable.onchange = (e) => updateLocal(e);
    if (this.domShortFreq) this.domShortFreq.onchange = (e) => updateLocal(e);
    if (this.domLongEnable) this.domLongEnable.onchange = (e) => updateLocal(e);
    if (this.domLongFreq) this.domLongFreq.onchange = (e) => updateLocal(e);

    this.domSendCmdBtn = document.getElementById('send-cmd-btn');
    this.domRgrContainer = document.getElementById('rgr-container');
    this.domRgrList = document.getElementById('rgr-list');
    this.domModalClose = document.getElementById('unit-modal-close');
    this.domScaleBarLine = document.getElementById('scale-bar-line');
    this.domScaleBarText = document.getElementById('scale-bar-text');

    const domSendCmdBtn = document.getElementById('send-cmd-btn');
    if (domSendCmdBtn) {
      domSendCmdBtn.onclick = () => {
        const hq = this.spaceships.get('HQ Ship');
        if (hq && hq.isNodeActive) {
          const shortFreq = (document.getElementById('short-freq') as HTMLSelectElement).value as FreqShort;
          const longFreq = (document.getElementById('long-freq') as HTMLSelectElement).value as FreqLong;
          const isShortEnabled = (document.getElementById('short-enable') as HTMLInputElement).checked;
          const isLongEnabled = (document.getElementById('long-enable') as HTMLInputElement).checked;

          // Send ONE Broadcast Command to ALL units
          hq.queue.push({
            id: `cmd-broadcast-${Date.now()}-${hq.id}`,
            type: PacketType.CMD,
            createdAt: Date.now(),
            originShipId: 'HQ Ship',
            targetShipId: undefined, // Broadcast to everyone
            payload: {
              shortFreq,
              longFreq,
              isShortEnabled,
              isLongEnabled
            }
          });
          
          this.showFloatingText(hq.x, hq.y, '全軍へ指示発令', '#f59e0b');
        }
      };
    }

    const domToggleRoleBtn = document.getElementById('toggle-role-btn');
    if (domToggleRoleBtn) {
      domToggleRoleBtn.onclick = () => {
        if (this.selectedUnitId) this.toggleNode(this.selectedUnitId);
      };
    }

    const domToggleModeBtn = document.getElementById('toggle-mode-btn');
    const domVizCycleBtn = document.getElementById('viz-cycle-btn');

    // Viz cycle button: cycles through modes
    const controlVizModes: { key: 'circles' | 'dots' | 'quality', label: string }[] = [
      { key: 'circles', label: 'サークル表示' },
      { key: 'dots', label: 'ライン表示' },
      { key: 'quality', label: '通信品質' }
    ];
    let controlVizIndex = 0;

    if (domVizCycleBtn) {
      domVizCycleBtn.onclick = () => {
        if (this.systemDisplayMode === SystemDisplayMode.CONTROL) {
          controlVizIndex = (controlVizIndex + 1) % controlVizModes.length;
          this.vizMode = controlVizModes[controlVizIndex].key;
          domVizCycleBtn.textContent = controlVizModes[controlVizIndex].label;
        }
        // In combat mode, only 射程 — no cycling
      };
    }

    if (domToggleModeBtn) {
      domToggleModeBtn.onclick = () => {
        this.systemDisplayMode = this.systemDisplayMode === SystemDisplayMode.CONTROL 
          ? SystemDisplayMode.COMBAT 
          : SystemDisplayMode.CONTROL;
        
        const isControl = this.systemDisplayMode === SystemDisplayMode.CONTROL;
        domToggleModeBtn.textContent = isControl ? 'モード：通信管制' : 'モード：戦闘指揮';
        domToggleModeBtn.className = isControl ? 'mode-toggle-btn' : 'mode-toggle-btn combat';

        if (domVizCycleBtn) {
          if (isControl) {
            controlVizIndex = 0;
            this.vizMode = 'circles';
            domVizCycleBtn.textContent = 'サークル表示';
          } else {
            this.vizMode = 'range';
            domVizCycleBtn.textContent = '射程';
          }
        }
      };
    }

    const domStartMissionBtn = document.getElementById('start-mission-btn');
    const domBriefingOverlay = document.getElementById('briefing-overlay');

    if (domStartMissionBtn && domBriefingOverlay) {
      domStartMissionBtn.onclick = () => {
        this.isBriefingActive = false;
        domBriefingOverlay.style.display = 'none';
      };
    }

    if (this.domModalClose) {
      this.domModalClose.onclick = () => {
        this.selectedUnitId = null;
        this.domUnitModal?.classList.add('hidden');
      };
    }

    // NOTE: send-cmd-btn handler is already set above (broadcast CMD via HQ queue).
    // Do NOT add a second handler here — it would overwrite the broadcast behavior.
  }

  private initGameData() {
    const cx = this.sys.game.canvas.width / 2;
    const cy = this.sys.game.canvas.height / 2;

    const shipCount = 4;
    for (let i = 0; i < shipCount; i++) {
      const id = i === 0 ? 'HQ Ship' : `Ship-${i}`;
      // Specific initial formation around HQ
      const x = i === 0 ? cx : cx + (i === 1 ? -400 : (i === 2 ? 400 : 0));
      const y = i === 0 ? cy : cy + (i === 3 ? 500 : 200);
      const ship = new Spaceship(id, x, y, 5);
      
      if (i === 0) {
        ship.isNodeActive = true;
        ship.pollingList = ['Ship-1', 'Ship-2', 'Ship-3'];
      }
      this.spaceships.set(id, ship);
    }

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

      let clickedId: string | null = null;
      let minDist = 30;

      for (const [id, ship] of this.spaceships.entries()) {
        const d = CommunicationSystem.getDistance(worldX, worldY, ship.x, ship.y);
        if (d < minDist) { minDist = d; clickedId = id; }
      }

      if (clickedId) {
        this.selectedUnitId = clickedId;
        this.openUnitModal();
      } else {
        if (this.selectedUnitId) {
          const ship = this.spaceships.get(this.selectedUnitId);
          if (ship) { ship.targetX = worldX; ship.targetY = worldY; }
        } else {
          this.domUnitModal?.classList.add('hidden');
        }
      }
    }
  }

  private openUnitModal() {
    if (!this.selectedUnitId || !this.domUnitModal) return;
    this.domUnitModal.classList.remove('hidden');
    this.updateModalData();
  }

  private updateModalData() {
    if (!this.selectedUnitId) return;

    const unit = this.spaceships.get(this.selectedUnitId);
    if (!unit) return;

    if (this.domUnitTitle) this.domUnitTitle.textContent = unit.id;
    if (this.domUnitType) this.domUnitType.textContent = 'Space Legacy Destroyer';
    if (this.domUnitLevel) this.domUnitLevel.textContent = `LV ${unit.level}${unit.isNodeActive ? ' (NODE)' : ''}`;

    let targets = 0;
    this.clutters.forEach(c => {
      if (CommunicationSystem.getDistance(unit.x, unit.y, c.x, c.y) < 150) targets++;
    });
    if (this.domUnitTargets) this.domUnitTargets.textContent = targets.toString();

    if (this.domShortEnable) this.domShortEnable.checked = unit.isShortEnabled;
    if (this.domShortFreq) this.domShortFreq.value = unit.shortFreq;
    if (this.domLongEnable) this.domLongEnable.checked = unit.isLongEnabled;
    if (this.domLongFreq) this.domLongFreq.value = unit.longFreq;

    // Authority check: Show "Send Command" only if HQ is selected AND active
    if (unit.id === 'HQ Ship' && unit.isNodeActive) {
        this.domSendCmdBtn?.classList.remove('hidden');
    } else {
        this.domSendCmdBtn?.classList.add('hidden');
    }

    const domToggleRoleBtn = document.getElementById('toggle-role-btn');
    if (domToggleRoleBtn) {
      domToggleRoleBtn.textContent = unit.isNodeActive ? 'ノード選択解除' : 'ノードに設定';
    }

    this.domShortEnable?.removeAttribute('disabled');
    this.domShortFreq?.removeAttribute('disabled');
    this.domLongEnable?.removeAttribute('disabled');
    this.domLongFreq?.removeAttribute('disabled');
    
    // Communication Status Table (Color-based)
    this.domRgrContainer?.classList.remove('hidden');
    if (this.domRgrList) {
      this.domRgrList.innerHTML = '';
      const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);
      
      this.spaceships.forEach(s => {
        if (s.id === unit.id) return;
        const { canConnect, dropRate } = CommunicationSystem.getLinkQuality(unit, s, activeNodes);
        
        let statusColor = '#ef4444'; // Red (Default/Offline)
        let statusText = 'OFFLINE';
        let statusIcon = '×';

        if (canConnect) {
          if (dropRate < 0.2) {
            statusColor = '#4ade80'; // Green (Stable)
            statusText = 'STABLE';
            statusIcon = '●';
          } else if (dropRate < 0.8) {
            statusColor = '#facc15'; // Yellow (Warning/Interference)
            statusText = 'UNSTABLE';
            statusIcon = '▲';
          } else {
            statusColor = '#ef4444'; // Red (High Error)
            statusText = 'POOR';
            statusIcon = '×';
          }
        }
        
        this.domRgrList!.innerHTML += `
          <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px;">
            <span style="color: #94a3b8;">${s.id}</span>
            <span style="color: ${statusColor}; font-weight: bold;">${statusIcon} ${statusText}</span>
          </div>`;
      });
    }
  }

  private toggleNode(id: string) {
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
      this.updateModalData();
    }
  }

  private recordLinkSuccess(id1: string, id2: string) {
    const key = [id1, id2].sort().join('-');
    this.lastLinkSuccess.set(key, this.timeElapsedMs);
  }

  update(time: number, delta: number) {
    if (this.isGameOver || this.isBriefingActive) return;

    this.timeElapsedMs += delta;
    const deltaSeconds = delta / 1000;
    const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);

    for (const ship of this.spaceships.values()) {
      ship.update(delta, this.spaceships, (node, target) => this.handlePolling(node, target));
    }

    if (this.domUnitModal && !this.domUnitModal.classList.contains('hidden')) {
      if (Math.floor(time) % 10 === 0) this.updateModalData();
    }

    // Old hub labels removed as we use spaceships now

    for (const [id, s] of this.spaceships.entries()) {
      const text = this.textLabels.get(id);
      const isHQ = (id === 'HQ Ship');
      if (text) {
        const sStr = s.isShortEnabled ? `近:${s.shortFreq}` : '近:OFF';
        const lStr = s.isLongEnabled ? `遠:${s.longFreq}` : '遠:OFF';
        
        // Show pending status if processing HQ command
        const statusStr = s.pendingFreqChange ? ' [SETTING...]' : '';
        text.setText(`${id}${statusStr}\n[${sStr} ${lStr}]`);
        text.setPosition(s.x, s.y + (isHQ ? 55 : 40));
        
        // HQ Ship tag is always WHITE. Others are state-dependent.
        if (isHQ) {
          text.setColor('#ffffff');
        } else {
          text.setColor(s.pendingFreqChange ? '#fbbf24' : (s.queue.length > 0 ? '#38bdf8' : '#f8fafc'));
        }
        text.setBackgroundColor('rgba(15, 23, 42, 0.85)');
        text.setPadding(6, 4);
      }
    }

    if (this.domScaleBarLine && this.domScaleBarText) {
      const zoom = this.cameras.main.zoom;
      // Calculate a "nice" distance based on zoom
      let distanceKm = 100;
      if (zoom < 0.5) distanceKm = 500;
      else if (zoom < 0.8) distanceKm = 200;
      else if (zoom > 1.5) distanceKm = 50;

      const pxPerKm = 1;
      const lengthPx = distanceKm * zoom * pxPerKm;

      this.domScaleBarLine.style.width = `${lengthPx}px`;
      this.domScaleBarText.textContent = `${distanceKm} km`;
    }

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
        const successfulPackets = CommunicationSystem.transferData(target, node, packetsToTx, activeNodes);
        if (successfulPackets.length > 0) {
          successfulPackets.forEach(p => node.receivePacket(p));
          this.showFloatingText(node.x, node.y, 'データ受信', '#4ade80');
          this.recordLinkSuccess(node.id, target.id);
        }
        const nodePackets = node.queue;
        const successfulNodePackets = CommunicationSystem.transferData(node, target, nodePackets, activeNodes);
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
             const successful = CommunicationSystem.transferData(target, nearbyShip, packets, activeNodes);
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
    const { canConnect } = CommunicationSystem.getLinkQuality(node, target, activeNodes);
    
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

  private draw(time: number) {
    this.linkGraphics.clear();
    this.linkGraphics.setBlendMode(Phaser.BlendModes.ADD);
    this.clutterGraphics.clear();
    this.interferenceGraphics.clear();

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

      // Node Pulse: Only in CONTROL mode
      if (isControl && ship.isNodeActive) {
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

      // Coverage Circles for Selected Unit (Control Mode Only)
      if (isSelected && isControl) {
        // Short Range (750km)
        g.lineStyle(1, 0x38bdf8, 0.3);
        g.strokeCircle(ship.x, ship.y, 750);
        
        // Long Range (2500km)
        g.lineStyle(1, 0x38bdf8, 0.15);
        g.strokeCircle(ship.x, ship.y, 2500);

        // Labels for ranges
        if (!this.textLabels.has(`range-label-s-${ship.id}`)) {
          this.textLabels.set(`range-label-s-${ship.id}`, this.add.text(ship.x, ship.y - 755, '近距離限界 (750km)', { fontSize: '10px', color: '#38bdf8', alpha: 0.6 }).setOrigin(0.5));
          this.textLabels.set(`range-label-l-${ship.id}`, this.add.text(ship.x, ship.y - 2505, '遠距離限界 (2500km)', { fontSize: '10px', color: '#38bdf8', alpha: 0.4 }).setOrigin(0.5));
        } else {
          this.textLabels.get(`range-label-s-${ship.id}`)?.setPosition(ship.x, ship.y - 755).setVisible(true);
          this.textLabels.get(`range-label-l-${ship.id}`)?.setPosition(ship.x, ship.y - 2505).setVisible(true);
        }
      } else {
        // Hide range labels if not selected
        this.textLabels.get(`range-label-s-${ship.id}`)?.setVisible(false);
        this.textLabels.get(`range-label-l-${ship.id}`)?.setVisible(false);
      }
    });

    // 3. Draw Communication (Control mode only)
    if (isControl) {
      activeNodes.forEach(node => {
        this.spaceships.forEach(target => {
          if (node.id === target.id) return;
          const { canConnect, dropRate } = CommunicationSystem.getLinkQuality(node, target, activeNodes);
          if (canConnect) {
            // Background thin link
            this.linkGraphics.lineStyle(1, 0x4ade80, (1 - dropRate) * 0.05);
            this.linkGraphics.lineBetween(node.x, node.y, target.x, target.y);
          }
        });
      });

      const waveSpeed = 750;
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
          const maxRange = poll.rangeMode === 'long' ? 2500 : 750;
          
          if (resWaveDist > 0 && resWaveDist <= maxRange) {
            if (this.vizMode === 'circles') {
              // Circle Mode: Expanding Wave
              const alpha = Math.max(0, 0.6 * (1 - resWaveDist / maxRange));
              this.linkGraphics.lineStyle(2, 0xfacc15, alpha);
              this.linkGraphics.strokeCircle(target.x, target.y, resWaveDist);
              this.linkGraphics.lineStyle(4, 0xfacc15, alpha * 0.3);
              this.linkGraphics.strokeCircle(target.x, target.y, resWaveDist);
            } else if (this.vizMode === 'dots') {
              // Dot Mode: Multiple Streamlines to all nearby ships within range
              this.spaceships.forEach(nearbyShip => {
                if (nearbyShip.id === target.id) return;
                const d = CommunicationSystem.getDistance(target.x, target.y, nearbyShip.x, nearbyShip.y);
                const { canConnect } = CommunicationSystem.getLinkQuality(target, nearbyShip, activeNodes);
                
                if (canConnect && resWaveDist <= d + 100) {
                  const t = Math.min(1.0, resWaveDist / d);
                  if (t > 0) this.drawStreamline(target.x, target.y, nearbyShip.x, nearbyShip.y, t, 0x38bdf8);
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
          
          const { canConnect, dropRate } = CommunicationSystem.getLinkQuality(source, target, activeNodes);
          
          // Check if there's a recent CMD success (Emergency path)
          const key = [source.id, target.id].sort().join('-');
          const lastTime = this.lastLinkSuccess.get(key);
          const isCommandPath = lastTime && (this.timeElapsedMs - lastTime) < 5000;
          
          if (canConnect || isCommandPath) {
            let color = 0x4ade80; // Green (Excellent)
            if (isCommandPath && !canConnect) color = 0xfbbf24; // Amber (CMD Path but Frequency mismatch)
            else if (dropRate > 0.5) color = 0xef4444; // Red (Poor)
            else if (dropRate > 0.2) color = 0xfacc15; // Yellow (Good)
            
            this.linkGraphics.lineStyle(2, color, 0.4);
            this.linkGraphics.lineBetween(source.x, source.y, target.x, target.y);
            
            // Draw quality percentage
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const qualityTextId = `quality-txt-${source.id}-${target.id}`;
            const qualityStr = isCommandPath && !canConnect ? 'CMD LINK' : `${Math.round((1 - dropRate) * 100)}%`;
            
            if (!this.textLabels.has(qualityTextId)) {
              this.textLabels.set(qualityTextId, this.add.text(midX, midY, qualityStr, { fontSize: '10px', color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)' }).setOrigin(0.5).setDepth(20));
            } else {
              this.textLabels.get(qualityTextId)?.setPosition(midX, midY).setText(qualityStr).setVisible(true);
            }
          }
        });
      }
    } else {
      // Hide all quality texts if not in mode or no selection
      this.textLabels.forEach((txt, key) => {
        if (key.startsWith('quality-txt-')) txt.setVisible(false);
      });
    }

    // 5. Draw Range Overlay (Combat/射程 mode)
    if (this.vizMode === 'range') {
      this.spaceships.forEach(ship => {
        // Short range circle (red)
        if (ship.isShortEnabled) {
          this.linkGraphics.lineStyle(1, 0xf87171, 0.25);
          this.linkGraphics.strokeCircle(ship.x, ship.y, 750);
        }
        // Long range circle (darker red)
        if (ship.isLongEnabled) {
          this.linkGraphics.lineStyle(1, 0xf87171, 0.12);
          this.linkGraphics.strokeCircle(ship.x, ship.y, 2500);
        }

        // Targeting lines to nearby clutters (threats)
        let threatCount = 0;
        this.clutters.forEach(c => {
          const d = CommunicationSystem.getDistance(ship.x, ship.y, c.x, c.y);
          if (d < 300 && threatCount < 5) {
            this.linkGraphics.lineStyle(1, 0xef4444, 0.15);
            this.linkGraphics.lineBetween(ship.x, ship.y, c.x, c.y);
            threatCount++;
          }
        });
      });
    }
  }

  private drawStreamline(startX: number, startY: number, endX: number, endY: number, progress: number, color: number) {
    const totalDist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const segmentLen = 60;
    
    const headT = progress;
    const tailT = Math.max(0, headT - (segmentLen / totalDist));
    
    const headX = startX + (endX - startX) * headT;
    const headY = startY + (endY - startY) * headT;
    const tailX = startX + (endX - startX) * tailT;
    const tailY = startY + (endY - startY) * tailT;

    this.linkGraphics.lineStyle(3, color, 0.8);
    this.linkGraphics.lineBetween(tailX, tailY, headX, headY);
    this.linkGraphics.fillStyle(color, 1.0);
    this.linkGraphics.fillCircle(headX, headY, 3);
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
        const { canConnect } = CommunicationSystem.getLinkQuality(ship, hqNode, nodes);
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

    if (reachSuccess && allLinkedSuccess && dataSuccess) {
      this.win();
    }
  }

  private win() {
    this.isGameOver = true;
    if (this.domGameOver) {
      this.domGameOver.classList.remove('hidden');
      if (this.domGameTitle) this.domGameTitle.textContent = 'MISSION SUCCESS';
      if (this.domGameDesc) this.domGameDesc.textContent = '調査データをHQに回収し、全部隊の安全を確保しました。';
    }
  }

  private lose() {
    this.isGameOver = true;
    if (this.domGameOver) {
      this.domGameOver.classList.remove('hidden');
      if (this.domGameTitle) this.domGameTitle.textContent = 'MISSION FAILURE';
      if (this.domGameDesc) this.domGameDesc.textContent = '制限時間内に調査を完了できませんでした。';
    }
  }

  private showFloatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y - 20, text, { fontSize: '14px', color, fontFamily: 'Rajdhani', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      duration: 1500,
      onComplete: () => t.destroy()
    });
  }
}
