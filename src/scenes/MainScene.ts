import { Scene } from 'phaser';
import { Spaceship } from '../models/Spaceship';
import type { DamageKind, EquipmentLevel, UnitType } from '../models/Spaceship';
import { SystemDisplayMode } from '../models/DataPacket';
import { CommunicationSystem } from '../models/CommunicationSystem';
import { OpticalMaster } from '../models/OpticalMaster';
import { MeteorSystem } from '../systems/MeteorSystem';
import { PlanetSystem } from '../systems/PlanetSystem';
import { CommunicationManager } from '../systems/CommunicationManager';
import { MissionManager } from '../systems/MissionManager';
import { CameraController } from '../systems/CameraController';
import { UIManager } from '../ui/UIManager';
import planetImg from '../assets/Planet/Planet_01.png';
import commPlanetImg from '../assets/Planet/Comm_planet_legacy.png';
import commTcpPlanetImg from '../assets/Planet/Comm_planet.png';
import meteorImg from '../assets/Planet/meteor_01.png';

type ReconDronePhase = 'outbound' | 'orbit' | 'returning';

interface ReconDrone {
  id: string;
  ownerId: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  phase: ReconDronePhase;
  orbitElapsedMs: number;
  orbitAngle: number;
}

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
  public meteorSystem!: MeteorSystem;
  public planetSystem!: PlanetSystem;
  public uiManager!: UIManager;
  private commManager!: CommunicationManager;
  private missionManager!: MissionManager;
  private cameraController!: CameraController;

  // DOM 要素は各 System / UIManager 内で管理

  private timeElapsedMs: number = 0;
  public isBriefingActive: boolean = true;
  public systemDisplayMode: SystemDisplayMode = SystemDisplayMode.CONTROL;
  public selectedAction: 'attack' | 'jamming' | 'warning' = 'attack';
  public vizMode: 'dots' | 'circles' | 'quality' | 'range' = 'circles';

  // 惑星 / 隕石 / 通信 / ミッション / カメラ状態は各 System 内で管理

  public selectedUnitId: string | null = null;
  private reconTargetingUnitId: string | null = null;
  private reconDrones: ReconDrone[] = [];
  private reconDroneCounter = 0;
  private readonly RECON_DRONE_CONTROL_RANGE = 400;
  private readonly RECON_DRONE_DETECTION_RANGE = 400;
  private readonly RECON_DRONE_SPEED = 180;
  private readonly RECON_DRONE_ORBIT_DURATION_MS = 5000;
  private readonly RECON_DRONE_ORBIT_RADIUS = 36;

  // Camera 状態は CameraController 内で管理

  // LV1 Features
  private interferenceZones: { x: number, y: number, radius: number }[] = [];
  private clutters: { x: number, y: number }[] = [];

  // アステロイド帯（サーベイポイント周辺の環状ゾーン）
  public asteroidBelt = { centerX: 3000, centerY: 3000, innerRadius: 800, outerRadius: 2200 };
  private asteroidDebris: { x: number, y: number, size: number, alpha: number }[] = [];

  constructor() {
    super('MainScene');
  }

  preload() {
    // 惑星画像を Phaser テクスチャとして読み込み
    this.load.image('planet', planetImg);
    // レガシー星間通信用の中継惑星画像（背景透過済み PNG をそのまま使用）
    this.load.image('planet_comm', commPlanetImg);
    // TCP/IP 星間通信用の新型中継惑星画像
    this.load.image('planet_comm_tcp', commTcpPlanetImg);
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
    this.commManager = new CommunicationManager(this);
    this.missionManager = new MissionManager(this);
    this.cameraController = new CameraController(this);

    this.initGameData();

    // Camera Setup - Unified
    const cx = this.sys.game.canvas.width / 2;
    const cy = this.sys.game.canvas.height / 2;
    // ユニット初期位置のオフセットに合わせて bounds を拡張（クランプ回避）
    this.cameras.main.setBounds(-6000, -6000, 12000, 12000);
    const initialZoom = this.isCompactViewport() ? 0.32 : 0.4;
    this.cameras.main.setZoom(initialZoom);
    // ユニット群を画面右側に表示してミッションパネル（左上）との重なりを回避
    this.cameras.main.centerOn(cx - 3200 - 250, cy - 3200);

    // クリック判定（ユニット/惑星/隕石）は MainScene 側のロジックに委譲
    this.cameraController.setClickHandler((wx, wy) => this.handleWorldClick(wx, wy));
    this.cameraController.attach();
  }

  private initGameData() {
    const cx = this.sys.game.canvas.width / 2;
    const cy = this.sys.game.canvas.height / 2;

    const SPAWN_OFFSET_X = -3200;
    const SPAWN_OFFSET_Y = -3200;

    // ユニット編成（issue #5）:
    //   L-Dest1 (Legacy Destroyer / HQ, ノード設定)
    //   Dest1   (Destroyer)
    //   L-Frig1 (Legacy Frigate)
    //   Frig1   (Frigate)
    //   Rep1    (Repair Ship)
    const formation: Array<{ id: string; type: UnitType; dx: number; dy: number }> = [
      { id: 'L-Dest1', type: 'Legacy Destroyer', dx: 0,    dy: 0   },
      { id: 'Dest1',   type: 'Destroyer',        dx: -400, dy: 200 },
      { id: 'L-Frig1', type: 'Legacy Frigate',   dx: 400,  dy: 200 },
      { id: 'Frig1',   type: 'Frigate',          dx: 0,    dy: 500 },
      { id: 'Rep1',    type: 'Repair Ship',      dx: -200, dy: 600 },
    ];

    for (const f of formation) {
      const x = cx + f.dx + SPAWN_OFFSET_X;
      const y = cy + f.dy + SPAWN_OFFSET_Y;
      const ship = new Spaceship(f.id, x, y, 1, f.type);
      if (f.type === 'Legacy Destroyer' && f.id === 'L-Dest1') {
        ship.isNodeActive = true;
        ship.pollingList = formation.filter(o => o.id !== f.id).map(o => o.id);
      }
      this.spaceships.set(f.id, ship);
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

    // 惑星をランダムに2つ配置（環境ハザード：通信干渉源）。
    // 加えてレガシー星間通信用の通信惑星をユニット編隊上方に固定配置。
    const unitSpawnCenter = { x: cx + SPAWN_OFFSET_X, y: cy + SPAWN_OFFSET_Y };
    this.planetSystem.init(cx, cy, this.missionManager.surveyPoint, unitSpawnCenter);

    // アステロイド帯: 中心をサーベイポイントに合わせ、岩屑をプリ生成
    this.asteroidBelt.centerX = this.missionManager.surveyPoint.x;
    this.asteroidBelt.centerY = this.missionManager.surveyPoint.y;
    this.asteroidDebris = [];
    const debrisCount = 100;
    const { centerX, centerY, innerRadius, outerRadius } = this.asteroidBelt;
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = innerRadius + Math.random() * (outerRadius - innerRadius);
      this.asteroidDebris.push({
        x: centerX + Math.cos(angle) * r,
        y: centerY + Math.sin(angle) * r,
        size: 1.5 + Math.random() * 3,
        alpha: 0.25 + Math.random() * 0.4,
      });
    }
  }

  private isCompactViewport(): boolean {
    return window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  }

  /**
   * CameraController からドラッグなしクリック時に呼ばれる。
   * 惑星 → 隕石 → ユニットの順にクリック判定を行う。
   */
  private handleWorldClick(worldX: number, worldY: number): void {
    if (this.handleReconTargetClick(worldX, worldY)) return;

    if (this.planetSystem.handleClick(worldX, worldY)) return;
    if (this.meteorSystem.handleClick(worldX, worldY)) return;

    let clickedId: string | null = null;
    let minDist = 30;
    for (const [id, ship] of this.spaceships.entries()) {
      const d = CommunicationSystem.getDistance(worldX, worldY, ship.x, ship.y);
      if (d < minDist) { minDist = d; clickedId = id; }
    }

    if (clickedId) {
      if (this.handleRepairTargetSelection(clickedId)) return;
      this.selectedUnitId = clickedId;
      this.uiManager.openUnit();
    } else if (this.selectedUnitId) {
      const ship = this.spaceships.get(this.selectedUnitId);
      if (ship) { ship.targetX = worldX; ship.targetY = worldY; }
    } else {
      this.uiManager.closeUnitModal();
    }
  }

  private handleRepairTargetSelection(clickedId: string): boolean {
    if (!this.selectedUnitId || this.selectedUnitId === clickedId) return false;

    const repair = this.spaceships.get(this.selectedUnitId);
    const target = this.spaceships.get(clickedId);
    if (!repair || !target) return false;
    if (!repair.isRepairShip() || target.isRepairShip()) return false;

    this.showRepairConfirmPanel(repair.id, target.id);
    return true;
  }

  private showRepairConfirmPanel(repairId: string, targetId: string): void {
    document.getElementById('repair-confirm-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'repair-confirm-panel';
    panel.style.position = 'absolute';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.zIndex = '1000';
    panel.style.width = '280px';
    panel.style.padding = '16px';
    panel.style.border = '1px solid rgba(74, 222, 128, 0.45)';
    panel.style.background = 'rgba(15, 23, 42, 0.96)';
    panel.style.boxShadow = '0 0 24px rgba(34, 197, 94, 0.18)';
    panel.style.color = '#e5e7eb';
    panel.style.fontFamily = 'Rajdhani, sans-serif';
    panel.style.pointerEvents = 'auto';

    const title = document.createElement('div');
    title.textContent = `${targetId} の修理を実施しますか？`;
    title.style.fontSize = '15px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '12px';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';

    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'YES';
    yesBtn.style.flex = '1';
    yesBtn.style.padding = '7px';
    yesBtn.style.cursor = 'pointer';
    yesBtn.style.color = '#bbf7d0';
    yesBtn.style.border = '1px solid rgba(74, 222, 128, 0.6)';
    yesBtn.style.background = 'rgba(34, 197, 94, 0.18)';

    const noBtn = document.createElement('button');
    noBtn.textContent = 'NO';
    noBtn.style.flex = '1';
    noBtn.style.padding = '7px';
    noBtn.style.cursor = 'pointer';
    noBtn.style.color = '#cbd5e1';
    noBtn.style.border = '1px solid rgba(148, 163, 184, 0.45)';
    noBtn.style.background = 'rgba(148, 163, 184, 0.12)';

    yesBtn.onclick = () => {
      const repair = this.spaceships.get(repairId);
      const target = this.spaceships.get(targetId);
      panel.remove();
      if (!repair || !target) return;
      this.startRepairDocking(repair, target);
    };
    noBtn.onclick = () => panel.remove();

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    panel.appendChild(title);
    panel.appendChild(actions);
    document.body.appendChild(panel);
  }

  private startRepairDocking(repair: Spaceship, target: Spaceship): void {
    if (repair.dockingPartnerId) this.releaseDocking(repair);
    if (target.dockingPartnerId) this.releaseDocking(target);

    repair.dockingPartnerId = target.id;
    repair.dockingPhase = 'approaching';
    repair.targetX = target.x;
    repair.targetY = target.y;

    target.dockingPartnerId = repair.id;
    target.dockingPhase = 'approaching';

    window.__chatWidget?.pushSystemMessage(`オペレーター: ${repair.id} が ${target.id} へ修理接近を開始します。`);
    this.showFloatingText(repair.x, repair.y, '修理接近 開始', '#4ade80');
  }

  public beginReconDroneTargeting(): void {
    if (this.systemDisplayMode !== SystemDisplayMode.COMBAT) {
      window.__chatWidget?.pushSystemMessage('戦闘指揮モードで使用して下さい');
      return;
    }
    if (!this.selectedUnitId) return;
    const ship = this.spaceships.get(this.selectedUnitId);
    if (!ship) return;

    this.reconTargetingUnitId = ship.id;
    window.__chatWidget?.pushSystemMessage('索敵ポイントを、示して下さい');
    this.showFloatingText(ship.x, ship.y, '索敵ポイントを、示して下さい', '#7dd3fc');
  }

  public isReconDroneTargetingUnit(unitId: string): boolean {
    return this.reconTargetingUnitId === unitId;
  }

  public getReconDetectionZones(): Array<{ x: number; y: number; radius: number }> {
    return this.reconDrones.map(drone => ({
      x: drone.x,
      y: drone.y,
      radius: this.RECON_DRONE_DETECTION_RANGE,
    }));
  }

  private handleReconTargetClick(worldX: number, worldY: number): boolean {
    if (!this.reconTargetingUnitId) return false;
    const ship = this.spaceships.get(this.reconTargetingUnitId);
    if (!ship || this.systemDisplayMode !== SystemDisplayMode.COMBAT) {
      this.reconTargetingUnitId = null;
      this.uiManager.updateReconDroneButtonState();
      return false;
    }

    const distance = CommunicationSystem.getDistance(worldX, worldY, ship.x, ship.y);
    if (distance > this.RECON_DRONE_CONTROL_RANGE) {
      window.__chatWidget?.pushSystemMessage('指定ポイントが索敵可能エリア外です');
      this.showFloatingText(worldX, worldY, 'エリア外', '#f87171');
      return true;
    }

    this.launchReconDrone(ship.id, ship.x, ship.y, worldX, worldY);
    this.reconTargetingUnitId = null;
    this.uiManager.updateReconDroneButtonState();
    return true;
  }

  private launchReconDrone(ownerId: string, originX: number, originY: number, targetX: number, targetY: number): void {
    this.reconDrones.push({
      id: `recon-${++this.reconDroneCounter}`,
      ownerId,
      originX,
      originY,
      x: originX,
      y: originY,
      targetX,
      targetY,
      phase: 'outbound',
      orbitElapsedMs: 0,
      orbitAngle: 0,
    });
    window.__chatWidget?.pushSystemMessage(`${ownerId} 索敵ドローン発進`);
    this.showFloatingText(originX, originY, '索敵ドローン 発進', '#38bdf8');
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

  /**
   * CommunicationManager 等から経過時間 ms を取得するための公開ゲッター。
   */
  public getTimeElapsedMs(): number {
    return this.timeElapsedMs;
  }

  update(time: number, delta: number) {
    if (this.missionManager.isGameOver() || this.isBriefingActive) return;

    this.timeElapsedMs += delta;

    this.updateReconDrones(delta);

    // 隕石の更新（spawn / 探知 / 衝突 / 戦闘）は MeteorSystem に委譲
    this.meteorSystem.update(delta, time);

    // 惑星の移動更新は PlanetSystem に委譲
    this.planetSystem.update(delta);

    for (const ship of this.spaceships.values()) {
      ship.update(delta, this.spaceships, (node, target) => this.commManager.handlePolling(node, target));

      // === 戦闘指揮モード: 被害の進行 ===
      // 対処中の被害は経過時間で消滅（小=10秒 / 中=20秒 / 大=30秒）
      if (ship.damages.length > 0) {
        const nowMs = Date.now();
        const before = ship.damages.length;
        ship.damages = ship.damages.filter(d => {
          if (d.phase !== 'treating' || d.treatStartedAt == null) return true;
          const durationMs =
            d.size === 'large' ? 30000 :
            d.size === 'medium' ? 20000 : 10000;
          return (nowMs - d.treatStartedAt) < durationMs;
        });
        if (ship.damages.length !== before) {
          ship.recalcArmorStatus();
          // 全被害消滅で通信・武器も復旧
          if (ship.damages.length === 0) {
            ship.combatEquipment.comm = 'GOOD';
            ship.combatEquipment.weapon = 'GOOD';
          }
        }
      }
      // 未対処被害から徐々にHP減少
      const drain = ship.getDamageHpDrainPerSec();
      if (drain > 0) {
        ship.hp = Math.max(0, ship.hp - drain * (delta / 1000));
      }

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
              this.commManager.handleOpticalTransmission(ship);
            }
          }
        }
      }

      // レガシー星間通信：有効ユニットは一定周期で通信惑星経由の同報を発信
      if (ship.isLegacyEnabled) {
        ship.legacyTimer -= delta;
        if (ship.legacyTimer <= 0) {
          // 2秒周期、ユニットごとに位相をずらして衝突を緩和
          ship.legacyTimer = 2000;
          this.commManager.handleLegacyTransmission(ship);
        }
      }

      // TCP/IP 星間通信：データ保有時に即送信（連続送信抑制クールダウンあり）
      if (ship.isTcpIpEnabled) {
        if (ship.tcpIpCooldown > 0) {
          ship.tcpIpCooldown -= delta;
        }
        if (ship.tcpIpCooldown <= 0 && ship.queue.length > 0) {
          // 多重通信の約2倍のスループットを実現する短いクールダウン
          ship.tcpIpCooldown = 150;
          this.commManager.handleTcpIpTransmission(ship);
        }
      }
    }

    // === Repair Ship の横付け修理処理 ===
    this.updateRepairDocking(delta);

    // === ユニット間衝突判定（大型隕石相当の被害を双方に与える） ===
    this.checkShipCollisions();

    // モーダル開放中は毎フレーム更新（HPバーがリアルタイムで反映されるように）
    this.uiManager.updateActiveModalDataIfOpen();

    // Old hub labels removed as we use spaceships now

    const isCombat = this.systemDisplayMode === SystemDisplayMode.COMBAT;
    for (const [id, s] of this.spaceships.entries()) {
      const text = this.textLabels.get(id);
      const isHQ = (id === 'L-Dest1');
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

    // アクティブな通信ポーリングを 1 フレーム分処理
    this.commManager.processActivePolls(delta);

    // ミッション判定と gameState 公開
    this.missionManager.update();

    // 経過時間表示の更新（整数秒）
    this.uiManager.updateTimeDisplay(this.timeElapsedMs, 0);
  }

  private updateReconDrones(delta: number): void {
    const dtSeconds = delta / 1000;
    const completedIds = new Set<string>();

    for (const drone of this.reconDrones) {
      if (drone.phase === 'outbound') {
        this.moveReconDroneToward(drone, drone.targetX, drone.targetY, dtSeconds);
        if (CommunicationSystem.getDistance(drone.x, drone.y, drone.targetX, drone.targetY) <= 2) {
          drone.x = drone.targetX;
          drone.y = drone.targetY;
          drone.phase = 'orbit';
          drone.orbitElapsedMs = 0;
        }
      } else if (drone.phase === 'orbit') {
        drone.orbitElapsedMs += delta;
        drone.orbitAngle += dtSeconds * 2.4;
        drone.x = drone.targetX + Math.cos(drone.orbitAngle) * this.RECON_DRONE_ORBIT_RADIUS;
        drone.y = drone.targetY + Math.sin(drone.orbitAngle) * this.RECON_DRONE_ORBIT_RADIUS;
        if (drone.orbitElapsedMs >= this.RECON_DRONE_ORBIT_DURATION_MS) {
          const owner = this.spaceships.get(drone.ownerId);
          if (owner) {
            drone.originX = owner.x;
            drone.originY = owner.y;
          }
          drone.phase = 'returning';
        }
      } else {
        const owner = this.spaceships.get(drone.ownerId);
        const returnX = owner?.x ?? drone.originX;
        const returnY = owner?.y ?? drone.originY;
        this.moveReconDroneToward(drone, returnX, returnY, dtSeconds);
        if (CommunicationSystem.getDistance(drone.x, drone.y, returnX, returnY) <= 4) {
          completedIds.add(drone.id);
          if (owner) this.showFloatingText(owner.x, owner.y, '索敵ドローン 帰投', '#7dd3fc');
        }
      }
    }

    if (completedIds.size > 0) {
      this.reconDrones = this.reconDrones.filter(drone => !completedIds.has(drone.id));
    }
  }

  private moveReconDroneToward(drone: ReconDrone, targetX: number, targetY: number, dtSeconds: number): void {
    const dx = targetX - drone.x;
    const dy = targetY - drone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 0.001) return;

    const step = Math.min(dist, this.RECON_DRONE_SPEED * dtSeconds);
    drone.x += (dx / dist) * step;
    drone.y += (dy / dist) * step;
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

    // 0b'. Asteroid Belt（環状ゾーンとその中の岩屑）
    {
      const { centerX, centerY, innerRadius, outerRadius } = this.asteroidBelt;
      // 帯領域の薄い茶色塗り（外周 - 内周のドーナツ）
      this.interferenceGraphics.fillStyle(0x78350f, 0.06);
      this.interferenceGraphics.fillCircle(centerX, centerY, outerRadius);
      // 内側をくり抜くため背景色で再塗り（背景: #020617）
      this.interferenceGraphics.fillStyle(0x020617, 1.0);
      this.interferenceGraphics.fillCircle(centerX, centerY, innerRadius);
      // 境界線（内周・外周）
      this.interferenceGraphics.lineStyle(2, 0xa16207, 0.3);
      this.interferenceGraphics.strokeCircle(centerX, centerY, innerRadius);
      this.interferenceGraphics.strokeCircle(centerX, centerY, outerRadius);

      // 岩屑（プリ生成された位置を毎フレーム描画）
      this.asteroidDebris.forEach(d => {
        this.clutterGraphics.fillStyle(0xa16207, d.alpha);
        this.clutterGraphics.fillCircle(d.x, d.y, d.size);
      });
    }

    // 0c. Optical Masters (Hidden from map as per request)

    // 1. Survey Point の描画は MissionManager に委譲
    this.missionManager.drawSurveyPoint(this.clutterGraphics, time);

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
      const isHQ = ship.id === 'L-Dest1';
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

      // 被害発生中（対処中含む）のユニット赤パルス
      if (ship.damages.length > 0) {
        const dmgPulse = (Math.sin(time / 300) + 1) / 2;
        g.lineStyle(2, 0xef4444, 0.4 + dmgPulse * 0.4);
        g.strokeCircle(ship.x, ship.y, isHQ ? 38 : 28);
      }

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
      
      this.commManager.getActivePolls().forEach(poll => {
        const hub = this.spaceships.get(poll.hubId);
        const target = this.spaceships.get(poll.targetId);
        if (!hub || !target) return;

        const elapsed = this.timeElapsedMs - poll.startTime;

        // レガシー星間通信：通信惑星を経由する2フェーズ演出
        if (poll.rangeMode === 'legacy' && poll.planetX !== undefined && poll.planetY !== undefined) {
          const senderShip = hub;
          const px = poll.planetX;
          const py = poll.planetY;
          const legacyColor = 0xfde047; // 薄黄色
          const legacyWaveSpeed = 2250;
          const legacyWaveDist = elapsed * (legacyWaveSpeed / 1000);
          const receivers = Array.from(this.spaceships.values())
            .filter(s => s.id !== senderShip.id && s.isLegacyEnabled);

          // A. 往路: sender → 通信惑星
          if (!poll.callReached) {
            const t = Math.min(1.0, legacyWaveDist / poll.distance);
            if (this.vizMode === 'circles') {
              // 光通信のサークル表示と同じ：往路はストリームラインが伸びる
              this.drawStreamline(senderShip.x, senderShip.y, px, py, t, legacyColor);
            } else if (this.vizMode === 'dots') {
              // ライン表示：4ドットストリーム
              this.drawFourDots(senderShip.x, senderShip.y, px, py, t, legacyColor);
            }
          }

          // B. 復路: 通信惑星 → 受信ユニット群
          if (poll.responseStarted) {
            const resElapsed = elapsed - (poll.distance / (legacyWaveSpeed / 1000));
            const resWaveDist = resElapsed * (legacyWaveSpeed / 1000);
            const maxRange = (poll.maxResponseDist ?? 0) + 300;

            if (resWaveDist > 0 && resWaveDist <= maxRange) {
              if (this.vizMode === 'circles') {
                // 多重通信と同じ：通信惑星中心の二重円
                const alpha = Math.max(0, 0.6 * (1 - resWaveDist / maxRange));
                this.linkGraphics.lineStyle(2, legacyColor, alpha);
                this.linkGraphics.strokeCircle(px, py, resWaveDist);
                if (resWaveDist > 30) {
                  this.linkGraphics.lineStyle(1, legacyColor, alpha * 0.7);
                  this.linkGraphics.strokeCircle(px, py, resWaveDist - 30);
                }
              } else if (this.vizMode === 'dots') {
                // 多重通信と同じ：4ドットを各受信ユニットへ
                receivers.forEach(receiver => {
                  const d = CommunicationSystem.getDistance(px, py, receiver.x, receiver.y);
                  if (resWaveDist <= d + 100) {
                    const t = Math.min(1.0, resWaveDist / d);
                    if (t > 0) {
                      this.drawFourDots(px, py, receiver.x, receiver.y, t, legacyColor);
                    }
                  }
                });
              }
            }
          }
          return; // 次の poll へ
        }

        // TCP/IP 星間通信：新型通信惑星を経由する2フェーズ演出（波速はレガシーの2倍）
        if (poll.rangeMode === 'tcpip' && poll.planetX !== undefined && poll.planetY !== undefined) {
          const senderShip = hub;
          const px = poll.planetX;
          const py = poll.planetY;
          const tcpColor = 0x22d3ee; // シアン
          const tcpWaveSpeed = 4500;
          const tcpWaveDist = elapsed * (tcpWaveSpeed / 1000);
          const receivers = Array.from(this.spaceships.values())
            .filter(s => s.id !== senderShip.id && s.isTcpIpEnabled);

          // A. 往路: sender → 新型通信惑星
          if (!poll.callReached) {
            const t = Math.min(1.0, tcpWaveDist / poll.distance);
            if (this.vizMode === 'circles') {
              const alpha = Math.max(0, 0.6 * (1 - tcpWaveDist / poll.distance));
              this.linkGraphics.lineStyle(2, tcpColor, alpha);
              this.linkGraphics.strokeCircle(senderShip.x, senderShip.y, tcpWaveDist);
            } else if (this.vizMode === 'dots') {
              this.drawFourDots(senderShip.x, senderShip.y, px, py, t, tcpColor);
            }
          }

          // B. 復路: 新型通信惑星 → 受信ユニット群
          if (poll.responseStarted) {
            const resElapsed = elapsed - (poll.distance / (tcpWaveSpeed / 1000));
            const resWaveDist = resElapsed * (tcpWaveSpeed / 1000);
            const maxRange = (poll.maxResponseDist ?? 0) + 300;

            if (resWaveDist > 0 && resWaveDist <= maxRange) {
              if (this.vizMode === 'circles') {
                const alpha = Math.max(0, 0.6 * (1 - resWaveDist / maxRange));
                this.linkGraphics.lineStyle(2, tcpColor, alpha);
                this.linkGraphics.strokeCircle(px, py, resWaveDist);
                if (resWaveDist > 30) {
                  this.linkGraphics.lineStyle(1, tcpColor, alpha * 0.7);
                  this.linkGraphics.strokeCircle(px, py, resWaveDist - 30);
                }
              } else if (this.vizMode === 'dots') {
                receivers.forEach(receiver => {
                  const d = CommunicationSystem.getDistance(px, py, receiver.x, receiver.y);
                  if (resWaveDist <= d + 100) {
                    const t = Math.min(1.0, resWaveDist / d);
                    if (t > 0) {
                      this.drawFourDots(px, py, receiver.x, receiver.y, t, tcpColor);
                    }
                  }
                });
              }
            }
          }
          return; // 次の poll へ
        }

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
          const lastTime = this.commManager.getLastLinkSuccess().get(key);
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

    // 5. Draw Range Overlay (Combat/射程 mode: MISSILE_RANGE 300km + 100km laser range)
    if (this.vizMode === 'range') {
      this.spaceships.forEach(ship => {
        this.linkGraphics.lineStyle(1, 0xef4444, 0.6);
        this.linkGraphics.strokeCircle(ship.x, ship.y, 100);
        // ミサイル射程 300km を薄いオレンジで表示
        this.linkGraphics.lineStyle(1, 0xfb923c, 0.25);
        this.linkGraphics.strokeCircle(ship.x, ship.y, ship.MISSILE_RANGE);
      });
    }

    this.drawReconDrones(time);

    // 6. Draw Meteors: MeteorSystem に委譲
    this.meteorSystem.draw(time);
  }

  private drawReconDrones(time: number): void {
    if (this.reconTargetingUnitId) {
      const ship = this.spaceships.get(this.reconTargetingUnitId);
      if (ship) {
        const pulse = (Math.sin(time / 350) + 1) / 2;
        this.linkGraphics.fillStyle(0x38bdf8, 0.05 + pulse * 0.03);
        this.linkGraphics.fillCircle(ship.x, ship.y, this.RECON_DRONE_CONTROL_RANGE);
        this.linkGraphics.lineStyle(2, 0x38bdf8, 0.5 + pulse * 0.3);
        this.linkGraphics.strokeCircle(ship.x, ship.y, this.RECON_DRONE_CONTROL_RANGE);
      }
    }

    for (const drone of this.reconDrones) {
      const pulse = (Math.sin(time / 260 + drone.orbitAngle) + 1) / 2;
      this.linkGraphics.lineStyle(1, 0x7dd3fc, 0.18 + pulse * 0.12);
      this.linkGraphics.strokeCircle(drone.x, drone.y, this.RECON_DRONE_DETECTION_RANGE);
      this.linkGraphics.lineStyle(1, 0x38bdf8, 0.35);
      this.linkGraphics.lineBetween(drone.originX, drone.originY, drone.x, drone.y);
      this.linkGraphics.fillStyle(0xe0f2fe, 1);
      this.linkGraphics.fillCircle(drone.x, drone.y, 5);
      this.linkGraphics.lineStyle(1, 0x38bdf8, 0.9);
      this.linkGraphics.strokeCircle(drone.x, drone.y, 9 + pulse * 4);
    }
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

  /**
   * MeteorSystem 等から全ユニット消滅時に呼ばれる敗北遷移。
   */
  public lose(): void {
    this.missionManager.lose();
  }

  /**
   * Repair Ship の手動横付け修理ロジック。
   * Repair Ship を選択中に対象ユニットをクリックし、確認後に Repair Ship 側が近接して修理する。
   */
  private updateRepairDocking(delta: number): void {
    const DOCK_DISTANCE = 40;       // 横付け到達距離
    const HEAL_RATE_PER_SEC = 5;    // 横付け中の HP 回復速度（HP/sec）

    const ships = Array.from(this.spaceships.values());

    // 既存ペアの状態更新
    for (const ship of ships) {
      if (!ship.dockingPartnerId) continue;
      const partner = this.spaceships.get(ship.dockingPartnerId);
      if (!partner) {
        // 相方が消えた -> 解除
        this.releaseDocking(ship);
        continue;
      }
      // Repair Ship 側はパートナー側で集中管理するため処理スキップ
      if (ship.isRepairShip()) continue;

      const repair = partner.isRepairShip() ? partner : ship.isRepairShip() ? ship : null;
      const other = ship; // ship は Repair Ship でない側
      if (!repair) continue;

      const dist = CommunicationSystem.getDistance(other.x, other.y, repair.x, repair.y);

      if (other.dockingPhase === 'approaching') {
        // 接近フェーズ: Repair Ship が対象ユニットへ近接する
        repair.targetX = other.x;
        repair.targetY = other.y;
        if (dist <= DOCK_DISTANCE) {
          // 横付け完了
          other.dockingPhase = 'docked';
          repair.dockingPhase = 'docked';
          other.dockHealStartHp = other.hp;
          repair.targetX = null;
          repair.targetY = null;
          repair.vx = 0;
          repair.vy = 0;
          window.__chatWidget?.pushSystemMessage(`オペレーター: ${other.id} が ${repair.id} と横付け完了。HP 回復を開始します。`);
        }
      } else if (other.dockingPhase === 'docked') {
        // 横付け中: HP 回復
        const startHp = other.dockHealStartHp ?? other.hp;
        const healTargetHp = Math.min(other.maxHp, startHp + (other.maxHp - startHp) / 2);
        if (other.hp < healTargetHp) {
          other.hp = Math.min(healTargetHp, other.hp + HEAL_RATE_PER_SEC * (delta / 1000));
        }
        this.updateRepairCountdownLabel(other, healTargetHp, HEAL_RATE_PER_SEC);
        // Repair Ship が対象ユニットへ密着追従する
        const offset = 25; // 横付け位置オフセット
        repair.x = other.x - offset;
        repair.y = other.y;
        repair.vx = 0;
        repair.vy = 0;

        if (other.hp >= healTargetHp - 0.01) {
          // 回復完了 -> 通知して解除
          other.hp = healTargetHp;
          window.__chatWidget?.pushSystemMessage(`オペレーター: ${other.id} の HP 回復完了。${repair.id} から離脱します。`);
          this.clearRepairCountdownLabel(other.id);
          this.releaseDocking(other);
        }
      }
    }
  }

  private updateRepairCountdownLabel(target: Spaceship, healTargetHp: number, healRatePerSec: number): void {
    const labelId = `repair-countdown-${target.id}`;
    const remainingSec = Math.max(0, Math.ceil((healTargetHp - target.hp) / healRatePerSec));
    const text = `修理完了まで ${remainingSec}s`;

    if (!this.textLabels.has(labelId)) {
      const countdown = this.add.text(target.x, target.y - 72, text, {
        fontSize: '12px',
        color: '#bbf7d0',
        fontStyle: 'bold',
        fontFamily: 'Rajdhani',
      }).setOrigin(0.5).setDepth(25);
      countdown.setBackgroundColor('rgba(15, 23, 42, 0.88)');
      countdown.setPadding(6, 4);
      this.textLabels.set(labelId, countdown);
    } else {
      this.textLabels.get(labelId)?.setText(text).setPosition(target.x, target.y - 72).setVisible(true);
    }
  }

  private clearRepairCountdownLabel(targetId: string): void {
    const labelId = `repair-countdown-${targetId}`;
    const label = this.textLabels.get(labelId);
    if (label) {
      label.destroy();
      this.textLabels.delete(labelId);
    }
  }

  /** Repair Ship との横付け / 接近状態を双方解除する */
  private releaseDocking(ship: Spaceship): void {
    const partner = ship.dockingPartnerId ? this.spaceships.get(ship.dockingPartnerId) : null;
    if (ship.isRepairShip()) {
      if (partner) this.clearRepairCountdownLabel(partner.id);
    } else {
      this.clearRepairCountdownLabel(ship.id);
    }
    ship.dockingPartnerId = null;
    ship.dockingPhase = null;
    ship.dockHealStartHp = null;
    ship.targetX = null;
    ship.targetY = null;
    if (partner) {
      partner.dockingPartnerId = null;
      partner.dockingPhase = null;
      partner.dockHealStartHp = null;
      partner.targetX = null;
      partner.targetY = null;
    }
  }

  /**
   * ユニット同士の衝突を検知し、大型隕石相当の被害を双方に与える。
   * 衝突閾値: 30km 以内。ペア重複防止のため id 文字列比較で1回のみ処理。
   */
  private checkShipCollisions(): void {
    const COLLISION_DISTANCE = 30;
    const COLLISION_DAMAGE = 200; // 大型隕石 LARGE と同等
    const SEPARATION_DISTANCE = 35;

    // ランダム劣化（MeteorSystem.ts の randomizeStatus と同じロジック）
    const randomizeStatus = (cur: EquipmentLevel): EquipmentLevel => {
      const r = Math.random();
      if (cur === 'UNABLE') return 'UNABLE';
      if (cur === 'POOR') return r < 0.3 ? 'UNABLE' : 'POOR';
      return r < 0.5 ? 'GOOD' : r < 0.85 ? 'POOR' : 'UNABLE';
    };

    const ships = Array.from(this.spaceships.values());
    const removed = new Set<string>();

    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      if (removed.has(a.id)) continue;
      for (let j = i + 1; j < ships.length; j++) {
        const b = ships[j];
        if (removed.has(b.id)) continue;
        // Repair Ship は他ユニットとの衝突扱いにしない
        if (a.isRepairShip() || b.isRepairShip()) continue;
        const dist = CommunicationSystem.getDistance(a.x, a.y, b.x, b.y);
        if (dist >= COLLISION_DISTANCE) continue;

        // 衝突発動: 双方に大型被害
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        this.meteorSystem.createCollisionEffect(midX, midY);
        this.showFloatingText(midX, midY, `衝突 -${COLLISION_DAMAGE} HP`, '#ef4444');
        window.__chatWidget?.pushSystemMessage(`${a.id} と ${b.id} が衝突！両艦に大被害`);

        for (const ship of [a, b]) {
          ship.hp = Math.max(0, ship.hp - COLLISION_DAMAGE);

          // 大被害（火災/破口ランダム）を追加
          const dmgKind: DamageKind = Math.random() < 0.5 ? 'fire' : 'breach';
          ship.damageCounter++;
          ship.damages.push({
            id: `dmg-${ship.id}-${ship.damageCounter}`,
            kind: dmgKind,
            size: 'large',
            phase: 'active',
            treatStartedAt: null,
          });
          if (dmgKind === 'breach') ship.recalcArmorStatus();

          // 通信・武器ステータスはランダム劣化
          ship.combatEquipment.comm = randomizeStatus(ship.combatEquipment.comm);
          ship.combatEquipment.weapon = randomizeStatus(ship.combatEquipment.weapon);
        }

        // 衝突直後の押し戻し: 双方を反対方向に最低 SEPARATION_DISTANCE まで離す
        if (dist > 0.001) {
          const dx = (b.x - a.x) / dist;
          const dy = (b.y - a.y) / dist;
          const push = (SEPARATION_DISTANCE - dist) / 2 + 1;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        } else {
          // 完全重なりの場合は適当な方向に分離
          a.x -= SEPARATION_DISTANCE / 2;
          b.x += SEPARATION_DISTANCE / 2;
        }
        // 慣性を打ち消し、再衝突を緩和
        a.vx = 0; a.vy = 0; a.targetX = null; a.targetY = null;
        b.vx = 0; b.vy = 0; b.targetX = null; b.targetY = null;

        // HP 0 以下のユニットは削除（MeteorSystem の隕石衝突処理と同等）
        for (const ship of [a, b]) {
          if (ship.hp <= 0) {
            removed.add(ship.id);
            this.meteorSystem.createCollisionEffect(ship.x, ship.y);
            window.__chatWidget?.pushSystemMessage(`${ship.id} 通信途絶！`);
            this.spaceships.delete(ship.id);
            const sg = this.shipGraphics.get(ship.id);
            if (sg) { sg.clear(); this.shipGraphics.delete(ship.id); }
            const label = this.textLabels.get(ship.id);
            if (label) { label.destroy(); this.textLabels.delete(ship.id); }
            const warnLabel = this.textLabels.get(`meteor-warning-${ship.id}`);
            if (warnLabel) { warnLabel.destroy(); this.textLabels.delete(`meteor-warning-${ship.id}`); }
            const proxLabel = this.textLabels.get(`warning-${ship.id}`);
            if (proxLabel) { proxLabel.destroy(); this.textLabels.delete(`warning-${ship.id}`); }
          }
        }
      }
    }
    if (this.spaceships.size === 0) this.lose();
  }

  /**
   * CameraController からゲームオーバー判定で呼ばれる。
   */
  public isGameOver(): boolean {
    return this.missionManager.isGameOver();
  }

}
