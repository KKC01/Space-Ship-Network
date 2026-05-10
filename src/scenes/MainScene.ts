import { Scene } from 'phaser';
import { Spaceship } from '../models/Spaceship';
import { PacketType, FreqShort, FreqLong, SystemDisplayMode } from '../models/DataPacket';
import { CommunicationSystem } from '../models/CommunicationSystem';
import { OpticalMaster } from '../models/OpticalMaster';
import { Planet, PLANET_SPECS } from '../models/Planet';
import { Meteor } from '../models/Meteor';
import legacyDestroyerImg from '../assets/Legacy_Destroyer.png';
import planetImg from '../assets/Planet_01.png';
import meteorImg from '../assets/meteor/meteor_01.png';

export class MainScene extends Scene {
  private spaceships: Map<string, Spaceship> = new Map();
  private opticalMasters: OpticalMaster[] = [];

  private shipGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private linkGraphics!: Phaser.GameObjects.Graphics;
  private clutterGraphics!: Phaser.GameObjects.Graphics;
  private interferenceGraphics!: Phaser.GameObjects.Graphics;

  private textLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  // DOM Elements
  private domGameOver!: HTMLElement | null;
  private domGameTitle!: HTMLElement | null;
  private domGameDesc!: HTMLElement | null;

  // Unit Modal DOM Elements
  private domUnitModal!: HTMLElement | null;
  private domUnitTitle!: HTMLElement | null;
  private domUnitType!: HTMLElement | null;
  private domUnitLevel!: HTMLElement | null;
  private domShortEnable!: HTMLInputElement | null;
  private domShortFreq!: HTMLSelectElement | null;
  private domLongEnable!: HTMLInputElement | null;
  private domLongFreq!: HTMLSelectElement | null;
  private domSendCmdBtn: HTMLElement | null = null;
  private domRgrContainer!: HTMLElement | null;
  private domRgrList!: HTMLElement | null;
  private domModalClose: HTMLElement | null = null;

  // Planet Modal DOM Elements
  private domPlanetModal: HTMLElement | null = null;
  private domPlanetModalClose: HTMLElement | null = null;
  private domPlanetId: HTMLElement | null = null;
  private domPlanetCommStation: HTMLElement | null = null;
  private domPlanetDesc: HTMLElement | null = null;
  private domMultiplexEnable!: HTMLInputElement | null;
  private domMultiplexMaster!: HTMLSelectElement | null;
  private domMultiplexSpeed!: HTMLSelectElement | null;
  private domMultiplexCipher!: HTMLSelectElement | null;
  private domMultiplexRelay!: HTMLInputElement | null;
  private domToggleStatusBtn!: HTMLElement | null;
  private domTimeDisplay!: HTMLElement | null;

  private domScaleBarLine!: HTMLElement | null;
  private domScaleBarText!: HTMLElement | null;

  // Meteor Modal DOM Elements
  private domMeteorModal: HTMLElement | null = null;
  private domMeteorModalClose: HTMLElement | null = null;
  private domMeteorId: HTMLElement | null = null;
  private domMeteorHpBar: HTMLElement | null = null;
  private domMeteorHpText: HTMLElement | null = null;
  private domMeteorSpeed: HTMLElement | null = null;
  private domMeteorTarget: HTMLElement | null = null;

  private timeElapsedMs: number = 0;
  private isGameOver: boolean = false;
  private isBriefingActive: boolean = true;
  private systemDisplayMode: SystemDisplayMode = SystemDisplayMode.CONTROL;
  private vizMode: 'dots' | 'circles' | 'quality' | 'range' = 'circles';
  
  
  private surveyPoint = { x: 3000, y: 3000, radius: 200 };

  // 惑星（環境ハザード）：通信干渉ゾーン
  private planets: Planet[] = [];
  private planetSprites: Phaser.GameObjects.Image[] = [];

  // 隕石（メテオ）
  private meteors: Map<string, Meteor> = new Map();
  private meteorSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private meteorSpawnTimer: number = 15000;
  private meteorCounter: number = 0;
  private meteorAlerted: Set<string> = new Set();
  private meteorGraphics!: Phaser.GameObjects.Graphics;
  private selectedMeteorId: string | null = null;
  
  private selectedUnitId: string | null = null;

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
    this.meteorGraphics = this.add.graphics().setDepth(6);

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
    this.domGameOver = document.getElementById('game-over-panel');
    this.domGameTitle = document.getElementById('game-over-title');
    this.domGameDesc = document.getElementById('game-over-desc');

    this.domUnitModal = document.getElementById('unit-modal');
    this.domUnitTitle = document.getElementById('unit-title');
    this.domUnitType = document.getElementById('unit-type');
    this.domUnitLevel = document.getElementById('unit-level');
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

    this.domMultiplexEnable = document.getElementById('multiplex-enable') as HTMLInputElement;
    this.domMultiplexMaster = document.getElementById('multiplex-master') as HTMLSelectElement;
    this.domMultiplexSpeed = document.getElementById('multiplex-speed') as HTMLSelectElement;
    this.domMultiplexCipher = document.getElementById('multiplex-cipher') as HTMLSelectElement;
    this.domMultiplexRelay = document.getElementById('multiplex-relay') as HTMLInputElement;
    this.domToggleStatusBtn = document.getElementById('toggle-status-btn');
    this.domTimeDisplay = document.getElementById('time-display');

    const updateMultiplex = (e?: Event) => {
      if (e && e.isTrusted && this.selectedUnitId) {
        const ship = this.spaceships.get(this.selectedUnitId);
        if (ship) {
          if (this.domMultiplexEnable) ship.isMultiplexEnabled = this.domMultiplexEnable.checked;
          if (this.domMultiplexMaster) ship.selectedMasterId = this.domMultiplexMaster.value || null;
          if (this.domMultiplexSpeed) ship.multiplexSpeed = this.domMultiplexSpeed.value as any;
          if (this.domMultiplexCipher) ship.multiplexCipher = this.domMultiplexCipher.value as any;
          if (this.domMultiplexRelay) ship.isOpticalRelayEnabled = this.domMultiplexRelay.checked;
          
          if (e.target === this.domMultiplexMaster) {
            ship.assignedSlots = [];
          }
        }
      }
    };

    if (this.domMultiplexEnable) this.domMultiplexEnable.onchange = (e) => updateMultiplex(e);
    if (this.domMultiplexMaster) this.domMultiplexMaster.onchange = (e) => updateMultiplex(e);
    if (this.domMultiplexSpeed) this.domMultiplexSpeed.onchange = (e) => updateMultiplex(e);
    if (this.domMultiplexCipher) this.domMultiplexCipher.onchange = (e) => updateMultiplex(e);
    if (this.domMultiplexRelay) this.domMultiplexRelay.onchange = (e) => updateMultiplex(e);

    if (this.domToggleStatusBtn) {
      this.domToggleStatusBtn.onclick = () => {
        if (this.domRgrContainer) {
          const isHidden = this.domRgrContainer.classList.contains('hidden');
          if (isHidden) {
            this.domRgrContainer.classList.remove('hidden');
            this.domToggleStatusBtn!.textContent = 'Communication Status 非表示';
          } else {
            this.domRgrContainer.classList.add('hidden');
            this.domToggleStatusBtn!.textContent = 'Communication Status 表示';
          }
        }
      };
    }

    // Accordion Logic
    const setupAccordion = (btnId: string, contentId: string) => {
      const btn = document.getElementById(btnId);
      const content = document.getElementById(contentId);
      if (btn && content) {
        btn.onclick = () => {
          btn.classList.toggle('open');
          content.classList.toggle('open');
        };
      }
    };
    setupAccordion('multiplex-group-btn', 'multiplex-group-content');
    setupAccordion('optical-group-btn', 'optical-group-content');

    // ミッションパネルの折りたたみトグル（経過時間との重なり回避用）
    const missionToggle = document.getElementById('mission-toggle');
    const missionPanel = document.getElementById('mission-panel');
    if (missionToggle && missionPanel) {
      missionToggle.onclick = () => {
        const isCollapsed = missionPanel.classList.toggle('collapsed');
        missionToggle.setAttribute('aria-expanded', String(!isCollapsed));
      };
    }

    this.domSendCmdBtn = document.getElementById('send-cmd-btn');
    this.domRgrContainer = document.getElementById('rgr-container');
    this.domRgrList = document.getElementById('rgr-list');
    this.domModalClose = document.getElementById('unit-modal-close');
    this.domPlanetModal = document.getElementById('planet-modal');
    this.domPlanetModalClose = document.getElementById('planet-modal-close');
    this.domPlanetId = document.getElementById('planet-id');
    this.domPlanetCommStation = document.getElementById('planet-comm-station');
    this.domPlanetDesc = document.getElementById('planet-desc');
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
        domBriefingOverlay.classList.add('hidden');
        console.log("Mission Started");
      };
    } else {
      console.warn("Briefing overlay or start button not found!");
      // Fallback: start game anyway if button missing
      this.isBriefingActive = false;
    }

    if (this.domModalClose) {
      this.domModalClose.onclick = () => {
        this.selectedUnitId = null;
        this.domUnitModal?.classList.add('hidden');
      };
    }

    if (this.domPlanetModalClose) {
      this.domPlanetModalClose.onclick = () => {
        this.domPlanetModal?.classList.add('hidden');
      };
    }

    // 隕石モーダル DOM
    this.domMeteorModal = document.getElementById('meteor-modal');
    this.domMeteorModalClose = document.getElementById('meteor-modal-close');
    this.domMeteorId = document.getElementById('meteor-id');
    this.domMeteorHpBar = document.getElementById('meteor-hp-bar');
    this.domMeteorHpText = document.getElementById('meteor-hp-text');
    this.domMeteorSpeed = document.getElementById('meteor-speed');
    this.domMeteorTarget = document.getElementById('meteor-target');

    if (this.domMeteorModalClose) {
      this.domMeteorModalClose.onclick = () => {
        this.selectedMeteorId = null;
        this.domMeteorModal?.classList.add('hidden');
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
    this.placePlanets(cx, cy);
  }

  // 惑星をランダム配置：他の重要地点から一定以上離す制約付き
  private placePlanets(cx: number, cy: number) {
    const PLANET_COUNT = 2;
    const RANGE = 7000;             // 配置範囲: cx/cy ± RANGE/2
    const MIN_DIST_BETWEEN = 1500;  // 惑星同士の最小距離
    const MIN_DIST_SURVEY = 1000;   // 調査ポイントから最小距離
    const MIN_DIST_SPAWN = 800;     // ユニットスポーン地点から最小距離
    const MAX_RETRIES = 10;

    const spawnX = cx;
    const spawnY = cy;

    // 配置に使う仕様を選定：PLN_05 を必ず含み、残りはその他からランダム
    const pln05 = PLANET_SPECS.find(s => s.id === 'PLN_05');
    const others = PLANET_SPECS.filter(s => s.id !== 'PLN_05');
    const selectedSpecs = pln05 ? [pln05] : [];
    while (selectedSpecs.length < PLANET_COUNT && others.length > 0) {
      const idx = Math.floor(Math.random() * others.length);
      selectedSpecs.push(others.splice(idx, 1)[0]);
    }

    for (let i = 0; i < PLANET_COUNT; i++) {
      const spec = selectedSpecs[i] || PLANET_SPECS[0];
      let candidate: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const x = cx + (Math.random() - 0.5) * RANGE;
        const y = cy + (Math.random() - 0.5) * RANGE;

        // 制約チェック
        const distFromSurvey = CommunicationSystem.getDistance(x, y, this.surveyPoint.x, this.surveyPoint.y);
        const distFromSpawn = CommunicationSystem.getDistance(x, y, spawnX, spawnY);
        if (distFromSurvey < MIN_DIST_SURVEY) continue;
        if (distFromSpawn < MIN_DIST_SPAWN) continue;

        let tooCloseToOther = false;
        for (const p of this.planets) {
          if (CommunicationSystem.getDistance(x, y, p.x, p.y) < MIN_DIST_BETWEEN) {
            tooCloseToOther = true;
            break;
          }
        }
        if (tooCloseToOther) continue;

        candidate = { x, y };
        break;
      }
      // フェイルオープン：制約を満たせなかったら最後の候補を使用
      if (!candidate) {
        candidate = {
          x: cx + (Math.random() - 0.5) * RANGE,
          y: cy + (Math.random() - 0.5) * RANGE,
        };
      }
      const planet = new Planet(spec.id, candidate.x, candidate.y, spec.hasCommStation, spec.description ?? '');
      this.planets.push(planet);

      // Phaser スプライトとして配置（クリック検出用に planetId を保存）
      const sprite = this.add.image(candidate.x, candidate.y, 'planet');
      sprite.setScale(0.5);
      sprite.setDepth(2);
      sprite.setData('planetId', spec.id);
      this.planetSprites.push(sprite);
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

      // 惑星クリック判定（船舶と同じ距離ベース、半径は表示サイズ 75×0.5 より十分大きめ）
      const PLANET_HIT_RADIUS = 100;
      for (let i = 0; i < this.planetSprites.length; i++) {
        const s = this.planetSprites[i];
        const dp = CommunicationSystem.getDistance(worldX, worldY, s.x, s.y);
        if (dp < PLANET_HIT_RADIUS) {
          this.openPlanetModal(this.planets[i].id);
          return;
        }
      }

      // 隕石クリック判定（探知済みの隕石のみ対象）
      const METEOR_HIT_RADIUS = 60;
      for (const [mId, meteor] of this.meteors.entries()) {
        if (!meteor.isDetected || meteor.isDestroyed) continue;
        const dm = CommunicationSystem.getDistance(worldX, worldY, meteor.x, meteor.y);
        if (dm < METEOR_HIT_RADIUS) {
          const isCombatMode = this.systemDisplayMode === SystemDisplayMode.COMBAT;
          if (isCombatMode && this.selectedUnitId) {
            // 戦闘指揮モード + ユニット選択済み → 攻撃指示
            const ship = this.spaceships.get(this.selectedUnitId);
            if (ship) {
              ship.attackTargetMeteorId = mId;
              window.__chatWidget?.pushSystemMessage(`${ship.id} → ${meteor.id} 攻撃します`);
              this.showFloatingText(ship.x, ship.y, '攻撃指示', '#f87171');
            }
          } else {
            // 通常モード → 隕石情報モーダル表示
            this.openMeteorModal(mId);
          }
          return;
        }
      }

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
    // 排他：惑星モーダルが開いていれば閉じる
    this.domPlanetModal?.classList.add('hidden');
    if (this.domUnitModal) this.domUnitModal.classList.remove('hidden');
    this.updateModalData();
  }

  // 惑星情報モーダルを開く（ユニットモーダルとは排他）
  private openPlanetModal(planetId: string) {
    const planet = this.planets.find(p => p.id === planetId);
    if (!planet || !this.domPlanetModal) return;

    // 排他：ユニットモーダルが開いていれば閉じる
    this.selectedUnitId = null;
    this.domUnitModal?.classList.add('hidden');

    if (this.domPlanetId) this.domPlanetId.textContent = planet.id;
    if (this.domPlanetCommStation) {
      this.domPlanetCommStation.textContent = planet.hasCommStation ? 'あり' : 'なし';
      this.domPlanetCommStation.style.color = planet.hasCommStation ? '#4ade80' : '#9ca3af';
    }
    if (this.domPlanetDesc) {
      this.domPlanetDesc.textContent = planet.description || '電波到達圏内では干渉が発生します。';
    }
    this.domPlanetModal.classList.remove('hidden');
  }

  private updateModalData() {
    if (!this.selectedUnitId) return;

    const unit = this.spaceships.get(this.selectedUnitId);
    if (!unit) return;

    // Update Master List dynamically
    if (this.domMultiplexMaster) {
      const currentMasterId = unit.selectedMasterId;
      this.domMultiplexMaster.innerHTML = '<option value="">-- 連接マスターを選択 --</option>';
      this.spaceships.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `連接マスター: ${s.id}`;
        this.domMultiplexMaster!.appendChild(opt);
      });
      this.domMultiplexMaster.value = currentMasterId || '';
    }

    const shipImg = document.getElementById('unit-ship-image') as HTMLImageElement | null;
    if (shipImg) shipImg.src = legacyDestroyerImg;
    if (this.domUnitTitle) this.domUnitTitle.textContent = unit.id;
    if (this.domUnitType) this.domUnitType.textContent = 'Legacy Destroyer';
    if (this.domUnitLevel) this.domUnitLevel.textContent = `1`;

    if (this.domShortEnable) this.domShortEnable.checked = unit.isShortEnabled;
    if (this.domShortFreq) this.domShortFreq.value = unit.shortFreq;
    if (this.domLongEnable) this.domLongEnable.checked = unit.isLongEnabled;
    if (this.domLongFreq) this.domLongFreq.value = unit.longFreq;

    if (this.domMultiplexEnable) this.domMultiplexEnable.checked = unit.isMultiplexEnabled;
    if (this.domMultiplexMaster) this.domMultiplexMaster.value = unit.selectedMasterId || '';
    if (this.domMultiplexSpeed) this.domMultiplexSpeed.value = unit.multiplexSpeed;
    if (this.domMultiplexCipher) this.domMultiplexCipher.value = unit.multiplexCipher;
    if (this.domMultiplexRelay) this.domMultiplexRelay.checked = unit.isOpticalRelayEnabled;

    // Authority check: Show "Send Command" only if HQ is selected AND active
    if (unit.id === 'HQ Ship' && unit.isNodeActive) {
        this.domSendCmdBtn?.classList.remove('hidden');
    } else {
        this.domSendCmdBtn?.classList.add('hidden');
    }

    const domUnitHpBar = document.getElementById('unit-hp-bar');
    if (domUnitHpBar) {
      const hpPercent = unit.hp / unit.maxHp;
      domUnitHpBar.style.width = `${hpPercent * 100}%`;
      domUnitHpBar.style.background = hpPercent < 0.3 ? '#ef4444' : '#4ade80';
    }

    const domToggleRoleBtn = document.getElementById('toggle-role-btn');
    if (domToggleRoleBtn) {
      domToggleRoleBtn.textContent = unit.isNodeActive ? 'ノード設定解除' : 'ノードに設定';
    }

    this.domShortEnable?.removeAttribute('disabled');
    this.domShortFreq?.removeAttribute('disabled');
    this.domLongEnable?.removeAttribute('disabled');
    this.domLongFreq?.removeAttribute('disabled');
    
    // Communication Status Table (Keep visibility state)
    if (this.domRgrList) {
      this.domRgrList.innerHTML = '';
      const activeNodes = Array.from(this.spaceships.values()).filter(s => s.isNodeActive);
      
      this.spaceships.forEach(s => {
        if (s.id === unit.id) return;
        const { canConnect: canRadio, dropRate: radioRate } = CommunicationSystem.getLinkQuality(unit, s, activeNodes, this.planets);
        const { canConnect: canOpt, dropRate: optRate } = CommunicationSystem.getOpticalMultiplexQuality(unit, s, activeNodes);
        
        let radioColor = '#ef4444'; 
        let radioText = 'OFFLINE';
        if (canRadio) {
          radioColor = radioRate < 0.2 ? '#4ade80' : '#facc15';
          radioText = radioRate < 0.2 ? 'STABLE' : 'WEAK';
        }

        let optColor = '#ef4444';
        let optText = 'OFFLINE';
        if (canOpt) {
          optColor = optRate < 0.2 ? '#a855f7' : '#d8b4fe'; // Purple
          optText = optRate < 0.2 ? 'STABLE' : 'WEAK';
        }
        
        this.domRgrList!.innerHTML += `
          <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 10px;">
            <div style="color: #94a3b8; margin-bottom: 2px;">${s.id}</div>
            <div style="display: flex; justify-content: space-between;">
              <span>光通信: <span style="color: ${radioColor};">${radioText}</span></span>
              <span>多重通信: <span style="color: ${optColor};">${optText}</span></span>
            </div>
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

    // 隕石スポーンタイマー
    this.meteorSpawnTimer -= delta;
    if (this.meteorSpawnTimer <= 0) {
      this.spawnMeteor();
    }
    // 隕石の更新・探知・衝突
    this.updateMeteors(delta);
    // 隕石への攻撃処理
    this.handleMeteorCombat(delta);

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

    if (this.domUnitModal && !this.domUnitModal.classList.contains('hidden')) {
      if (Math.floor(time) % 10 === 0) this.updateModalData();
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
          const sStr = s.isShortEnabled ? `近:${s.shortFreq}` : '近:OFF';
          const lStr = s.isLongEnabled ? `遠:${s.longFreq}` : '遠:OFF';
          const statusStr = s.pendingFreqChange ? ' [SETTING...]' : '';
          text.setText(`${id}${statusStr}\n[${sStr} ${lStr}]`);
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

    if (this.domTimeDisplay) {
      this.domTimeDisplay.textContent = (this.timeElapsedMs / 1000).toFixed(1);
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
        const successfulPackets = CommunicationSystem.transferData(target, node, packetsToTx, activeNodes, this.planets);
        if (successfulPackets.length > 0) {
          successfulPackets.forEach(p => node.receivePacket(p));
          this.showFloatingText(node.x, node.y, 'データ受信', '#4ade80');
          this.recordLinkSuccess(node.id, target.id);
        }
        const nodePackets = node.queue;
        const successfulNodePackets = CommunicationSystem.transferData(node, target, nodePackets, activeNodes, this.planets);
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
             const successful = CommunicationSystem.transferData(target, nearbyShip, packets, activeNodes, this.planets);
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
    if (this.domTimeDisplay) {
      this.domTimeDisplay.textContent = Math.floor(this.timeElapsedMs / 1000).toString();
    }

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
    const { canConnect } = CommunicationSystem.getLinkQuality(node, target, activeNodes, this.planets);
    
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
    this.meteorGraphics.clear();

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

    // 1b. 惑星の干渉ゾーン（通信品質モード時のみ表示・薄ピンクFill）
    if (this.vizMode === 'quality') {
      const PINK = 0xfb7185;
      for (const planet of this.planets) {
        // 長距離干渉ゾーン (2500km) - 外側、薄め
        this.clutterGraphics.fillStyle(PINK, 0.04);
        this.clutterGraphics.fillCircle(planet.x, planet.y, CommunicationSystem.PLANET_LONG_RANGE_INTERFERENCE);
        // 短距離干渉ゾーン (700km) - 内側、濃いめ
        this.clutterGraphics.fillStyle(PINK, 0.08);
        this.clutterGraphics.fillCircle(planet.x, planet.y, CommunicationSystem.PLANET_SHORT_RANGE_INTERFERENCE);
      }
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
          const { canConnect: canStandard, dropRate: standardRate } = CommunicationSystem.getLinkQuality(source, target, activeNodes, this.planets);
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
          const { canConnect, dropRate } = CommunicationSystem.getLinkQuality(node, target, activeNodes, this.planets);
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
                  : (nearbyShip.id !== target.id && CommunicationSystem.getLinkQuality(target, nearbyShip, activeNodes, this.planets).canConnect);

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

          const { canConnect, dropRate } = CommunicationSystem.getLinkQuality(source, target, activeNodes, this.planets);
          
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

    // 6. Draw Meteors: スプライト更新・接近警報・攻撃エフェクト
    this.drawMeteors(time);
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
        const { canConnect } = CommunicationSystem.getLinkQuality(ship, hqNode, nodes, this.planets);
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

  private win() {
    this.isGameOver = true;
    if (this.domGameOver) {
      this.domGameOver.classList.remove('hidden');
      if (this.domGameTitle) this.domGameTitle.textContent = 'MISSION SUCCESS';
      if (this.domGameDesc) this.domGameDesc.textContent = '調査データをHQに回収し、全部隊の安全を確保しました。';
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

  // ==================== 隕石（メテオ）関連メソッド ====================

  /**
   * 隕石をスポーンする。ランダムなユニットから500kmの位置に出現。
   */
  private spawnMeteor() {
    // 次のスポーンタイマーをリセット（15〜30秒）
    this.meteorSpawnTimer = 15000 + Math.random() * 15000;

    const shipIds = Array.from(this.spaceships.keys());
    if (shipIds.length === 0) return;

    const targetId = shipIds[Math.floor(Math.random() * shipIds.length)];
    const targetShip = this.spaceships.get(targetId);
    if (!targetShip) return;

    this.meteorCounter++;
    const meteorId = `METEOR-${String(this.meteorCounter).padStart(3, '0')}`;

    // どのユニットからみても500km以上離れた位置から発動する
    let mx = 0, my = 0;
    let found = false;
    for (let attempts = 0; attempts < 100; attempts++) {
      const baseShip = Array.from(this.spaceships.values())[Math.floor(Math.random() * this.spaceships.size)];
      const angle = Math.random() * Math.PI * 2;
      const testX = baseShip.x + Math.cos(angle) * 500;
      const testY = baseShip.y + Math.sin(angle) * 500;
      
      let allFar = true;
      for (const ship of this.spaceships.values()) {
        const d = CommunicationSystem.getDistance(testX, testY, ship.x, ship.y);
        if (d < 490) { // マージンとして490km未満はNG
          allFar = false;
          break;
        }
      }
      if (allFar) {
        mx = testX;
        my = testY;
        found = true;
        break;
      }
    }
    
    // 見つからなかった場合のフォールバック（ターゲットから500km）
    if (!found) {
      const angle = Math.random() * Math.PI * 2;
      mx = targetShip.x + Math.cos(angle) * 500;
      my = targetShip.y + Math.sin(angle) * 500;
    }

    // ランダムにサイズを決定
    const r = Math.random();
    let size: import('../models/Meteor').MeteorSize = 'SMALL';
    if (r < 0.1) size = 'LARGE';
    else if (r < 0.3) size = 'MEDIUM';
    else if (r < 0.7) size = 'SMALL';
    else size = 'TINY';

    const meteor = new Meteor(meteorId, mx, my, targetId, targetShip.x, targetShip.y, size);
    this.meteors.set(meteorId, meteor);

    // Phaserスプライトを作成（探知前は非表示）
    const sprite = this.add.image(mx, my, 'meteor');
    let scale = 0.1;
    if (size === 'LARGE') scale = 0.1;
    else if (size === 'MEDIUM') scale = 0.1 / 3;
    else if (size === 'SMALL') scale = 0.1 / 5;
    else if (size === 'TINY') scale = 0.1 / 10;
    sprite.setScale(scale);
    sprite.setDepth(4);
    sprite.setVisible(false);
    this.meteorSprites.set(meteorId, sprite);
  }

  /**
   * 隕石の移動・探知・接近警報・衝突判定を更新する。
   */
  private updateMeteors(dt: number) {
    const toRemove: string[] = [];

    for (const [mId, meteor] of this.meteors.entries()) {
      if (meteor.isDestroyed) {
        toRemove.push(mId);
        continue;
      }

      // 移動・回転更新
      meteor.update(dt);

      // 全ユニットとの距離をチェック → 探知判定
      if (!meteor.isDetected) {
        for (const ship of this.spaceships.values()) {
          const d = CommunicationSystem.getDistance(meteor.x, meteor.y, ship.x, ship.y);
          if (d <= 400) {
            meteor.isDetected = true;
            // スプライトを表示
            const sprite = this.meteorSprites.get(mId);
            if (sprite) sprite.setVisible(true);
            
            // Operator AI 警告
            let warnMsg = '';
            if (meteor.sizeType === 'LARGE') warnMsg = '大型隕石、探知！';
            else if (meteor.sizeType === 'MEDIUM') warnMsg = '中型隕石、探知';
            else if (meteor.sizeType === 'SMALL') warnMsg = '小型隕石、探知';
            else if (meteor.sizeType === 'TINY') warnMsg = '極小隕石、探知中';
            
            window.__chatWidget?.pushSystemMessage(warnMsg);

            if (this.systemDisplayMode === SystemDisplayMode.CONTROL) {
              window.__chatWidget?.pushSystemMessage('戦闘指揮に変更お願いします');
            }

            this.showFloatingText(meteor.x, meteor.y, '隕石探知', '#fb923c');
            break;
          }
        }
      }

      // 衝突判定（全ユニットに対して、距離 < meteor.radius）
      let hitShip = null;
      for (const ship of this.spaceships.values()) {
        const distToTarget = CommunicationSystem.getDistance(meteor.x, meteor.y, ship.x, ship.y);
        // シップ自身の半径（約10〜15km）を考慮してマージンを取る
        if (distToTarget < meteor.radius + 15) {
          hitShip = ship;
          break;
        }
      }

      if (hitShip) {
        // ユニットにダメージ（隕石HP分）
        hitShip.hp = Math.max(0, hitShip.hp - meteor.hp);
        // 衝突エフェクト
        this.createCollisionEffect(meteor.x, meteor.y);
        this.showFloatingText(hitShip.x, hitShip.y, `衝突 -${meteor.hp} HP`, '#ef4444');
        
        if (hitShip.hp <= 0) {
          // 爆発のモーションと消滅
          this.createCollisionEffect(hitShip.x, hitShip.y);
          window.__chatWidget?.pushSystemMessage(`${hitShip.id} 通信途絶！`);
          this.spaceships.delete(hitShip.id);
          const sg = this.shipGraphics.get(hitShip.id);
          if (sg) {
            sg.clear();
            this.shipGraphics.delete(hitShip.id);
          }
        } else {
          let colMsg = '';
          if (meteor.sizeType === 'LARGE') colMsg = `大型隕石、迎撃失敗。${hitShip.id}に衝突！被害確認中…`;
          else if (meteor.sizeType === 'MEDIUM') colMsg = `中型隕石、迎撃失敗。${hitShip.id}に衝突！被害確認中…`;
          else if (meteor.sizeType === 'SMALL') colMsg = `小型隕石、${hitShip.id}に衝突`;
          if (colMsg) window.__chatWidget?.pushSystemMessage(colMsg);
        }

        // 隕石を消滅
        meteor.isDestroyed = true;
        toRemove.push(mId);
      }
    }

    // 破壊された隕石を削除
    for (const mId of toRemove) {
      this.removeMeteor(mId);
    }

    // 隕石モーダルが開いている場合データを更新
    if (this.selectedMeteorId && this.domMeteorModal && !this.domMeteorModal.classList.contains('hidden')) {
      this.updateMeteorModalData();
    }
  }

  /**
   * ユニットから隕石への攻撃処理。
   */
  private handleMeteorCombat(dt: number) {
    for (const ship of this.spaceships.values()) {
      if (!ship.attackTargetMeteorId) continue;

      const meteor = this.meteors.get(ship.attackTargetMeteorId);
      if (!meteor || meteor.isDestroyed) {
        ship.attackTargetMeteorId = null;
        continue;
      }

      // クールダウン更新
      ship.attackCooldown = Math.max(0, ship.attackCooldown - dt);

      const dist = CommunicationSystem.getDistance(ship.x, ship.y, meteor.x, meteor.y);
      if (dist <= ship.ATTACK_RANGE && ship.attackCooldown <= 0) {
        // 攻撃！
        meteor.takeDamage(ship.ATTACK_DAMAGE);
        ship.attackCooldown = ship.ATTACK_COOLDOWN_MS;
        this.showFloatingText(meteor.x, meteor.y, `HIT -${ship.ATTACK_DAMAGE}`, '#fbbf24');

        if (meteor.isDestroyed) {
          this.createExplosion(meteor.x, meteor.y);
          window.__chatWidget?.pushSystemMessage(`${meteor.id} を撃破しました`);
          this.removeMeteor(ship.attackTargetMeteorId);
          ship.attackTargetMeteorId = null;
        }
      }
    }
  }

  /**
   * 隕石スプライトの位置・回転更新、接近警報、攻撃エフェクトの描画。
   */
  private drawMeteors(time: number) {
    const shipsWithWarnings = new Set<string>();
    for (const [mId, meteor] of this.meteors.entries()) {
      if (meteor.isDestroyed) continue;

      const sprite = this.meteorSprites.get(mId);
      if (sprite && meteor.isDetected) {
        sprite.setPosition(meteor.x, meteor.y);
        sprite.setRotation(meteor.rotation);

        // Check proximity for all ships to determine warnings
        for (const ship of this.spaceships.values()) {
          const d = CommunicationSystem.getDistance(meteor.x, meteor.y, ship.x, ship.y);
          if (d < 200) {
            shipsWithWarnings.add(ship.id);
          }
        }

        // 隕石のHPバー表示
        const hpPercent = meteor.hp / meteor.maxHp;
        this.meteorGraphics.fillStyle(0x000000, 0.6);
        this.meteorGraphics.fillRect(meteor.x - 20, meteor.y - 30, 40, 4);
        this.meteorGraphics.fillStyle(hpPercent < 0.3 ? 0xef4444 : 0xfb923c, 0.8);
        this.meteorGraphics.fillRect(meteor.x - 20, meteor.y - 30, 40 * hpPercent, 4);
      }
    }

    // 接近警報の描画（集約して判定）
    for (const ship of this.spaceships.values()) {
      const warningId = `meteor-warning-${ship.id}`;
      if (shipsWithWarnings.has(ship.id)) {
        const pulse = (Math.sin(time / 200) + 1) / 2;
        const isHQ = ship.id === 'HQ Ship';

        this.meteorGraphics.lineStyle(3, 0xef4444, 0.5 + pulse * 0.5);
        this.meteorGraphics.strokeCircle(ship.x, ship.y, isHQ ? 55 : 40);

        if (!this.textLabels.has(warningId)) {
          const wt = this.add.text(ship.x, ship.y - 55, 'METEOR WARNING', {
            fontSize: '12px', color: '#ef4444', fontStyle: 'bold', fontFamily: 'Rajdhani'
          }).setOrigin(0.5).setDepth(20);
          this.textLabels.set(warningId, wt);
        } else {
          const txt = this.textLabels.get(warningId);
          if (txt) {
            txt.setPosition(ship.x, ship.y - 55).setVisible(true);
          }
        }
      } else {
        const txt = this.textLabels.get(warningId);
        if (txt) txt.setVisible(false);
      }
    }

    // 攻撃レーザーエフェクトの描画
    for (const ship of this.spaceships.values()) {
      if (!ship.attackTargetMeteorId) continue;
      const meteor = this.meteors.get(ship.attackTargetMeteorId);
      if (!meteor || meteor.isDestroyed) continue;

      const dist = CommunicationSystem.getDistance(ship.x, ship.y, meteor.x, meteor.y);
      if (dist <= ship.ATTACK_RANGE) {
        // レーザービームエフェクト（攻撃クールダウンの残り時間で明滅）
        const intensity = ship.attackCooldown > 0 ? (ship.attackCooldown / ship.ATTACK_COOLDOWN_MS) : 0;
        const alpha = 0.3 + intensity * 0.7;
        this.meteorGraphics.lineStyle(2, 0xfbbf24, alpha);
        this.meteorGraphics.lineBetween(ship.x, ship.y, meteor.x, meteor.y);

        // ヒットポイント光点
        if (intensity > 0.5) {
          this.meteorGraphics.fillStyle(0xffffff, intensity);
          this.meteorGraphics.fillCircle(meteor.x, meteor.y, 5);
        }
      } else {
        // 射程外だが追尾中 → 点線で表示
        this.meteorGraphics.lineStyle(1, 0xfbbf24, 0.15);
        this.meteorGraphics.lineBetween(ship.x, ship.y, meteor.x, meteor.y);
      }
    }
  }

  /**
   * 爆発エフェクトを生成する（隕石撃破時）。
   */
  private createExplosion(x: number, y: number) {
    // 複数の拡大・フェードアウトする円で爆発を表現
    const colors = [0xff6b35, 0xef4444, 0xfbbf24, 0xffffff];
    for (let i = 0; i < colors.length; i++) {
      const g = this.add.graphics().setDepth(20);
      const startRadius = 5 + i * 3;
      const endRadius = 40 + i * 20;
      const delay = i * 50;

      g.fillStyle(colors[i], 0.8);
      g.fillCircle(x, y, startRadius);

      this.tweens.add({
        targets: { radius: startRadius, alpha: 0.8 },
        radius: endRadius,
        alpha: 0,
        duration: 600,
        delay,
        ease: 'Power2',
        onUpdate: (tween: Phaser.Tweens.Tween) => {
          const r = tween.getValue() as number;
          const a = 0.8 * (1 - tween.progress);
          g.clear();
          g.fillStyle(colors[i], a);
          g.fillCircle(x, y, r);
        },
        onComplete: () => g.destroy()
      });
    }

    // 破片飛散エフェクト
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.5;
      const speed = 30 + Math.random() * 40;
      const particle = this.add.graphics().setDepth(20);
      particle.fillStyle(0xfbbf24, 1);
      particle.fillCircle(x, y, 2);

      const endX = x + Math.cos(angle) * speed;
      const endY = y + Math.sin(angle) * speed;

      this.tweens.add({
        targets: particle,
        x: endX - x,
        y: endY - y,
        alpha: 0,
        duration: 500 + Math.random() * 300,
        ease: 'Power2',
        onUpdate: () => {
          particle.clear();
          particle.fillStyle(0xfbbf24, particle.alpha);
          particle.fillCircle(x + particle.x, y + particle.y, 2);
        },
        onComplete: () => particle.destroy()
      });
    }
  }

  /**
   * 衝突エフェクトを生成する（隕石がユニットに到達した時）。
   */
  private createCollisionEffect(x: number, y: number) {
    // 白い衝撃波リング
    const ring = this.add.graphics().setDepth(20);
    this.tweens.add({
      targets: { radius: 10, alpha: 1 },
      radius: 80,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        const r = tween.getValue() as number;
        const a = 1 - tween.progress;
        ring.clear();
        ring.lineStyle(3, 0xffffff, a);
        ring.strokeCircle(x, y, r);
      },
      onComplete: () => ring.destroy()
    });

    // オレンジ爆発フラッシュ
    const flash = this.add.graphics().setDepth(19);
    flash.fillStyle(0xff6b35, 0.6);
    flash.fillCircle(x, y, 30);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy()
    });

    // カメラシェイク
    this.cameras.main.shake(200, 0.005);
  }

  /**
   * 隕石をマップから削除する。
   */
  private removeMeteor(meteorId: string) {
    this.meteors.delete(meteorId);
    const sprite = this.meteorSprites.get(meteorId);
    if (sprite) {
      sprite.destroy();
      this.meteorSprites.delete(meteorId);
    }
    this.meteorAlerted.delete(meteorId);

    // 隕石モーダルが開いていれば閉じる
    if (this.selectedMeteorId === meteorId) {
      this.selectedMeteorId = null;
      this.domMeteorModal?.classList.add('hidden');
    }

    // 全ユニットの攻撃対象をクリア
    for (const ship of this.spaceships.values()) {
      if (ship.attackTargetMeteorId === meteorId) {
        ship.attackTargetMeteorId = null;
      }
    }
  }

  /**
   * 隕石情報モーダルを開く（ユニット・惑星モーダルと排他）。
   */
  private openMeteorModal(meteorId: string) {
    const meteor = this.meteors.get(meteorId);
    if (!meteor || !this.domMeteorModal) return;

    // 排他制御
    this.selectedUnitId = null;
    this.domUnitModal?.classList.add('hidden');
    this.domPlanetModal?.classList.add('hidden');

    this.selectedMeteorId = meteorId;
    this.domMeteorModal.classList.remove('hidden');
    this.updateMeteorModalData();
  }

  /**
   * 隕石モーダルのデータを更新する。
   */
  private updateMeteorModalData() {
    if (!this.selectedMeteorId) return;
    const meteor = this.meteors.get(this.selectedMeteorId);
    if (!meteor) return;

    if (this.domMeteorId) this.domMeteorId.textContent = meteor.id;
    if (this.domMeteorHpBar) {
      const pct = (meteor.hp / meteor.maxHp) * 100;
      this.domMeteorHpBar.style.width = `${pct}%`;
    }
    if (this.domMeteorHpText) this.domMeteorHpText.textContent = `${meteor.hp} / ${meteor.maxHp}`;
    if (this.domMeteorSpeed) this.domMeteorSpeed.textContent = `${meteor.speed} km/s`;
    if (this.domMeteorTarget) this.domMeteorTarget.textContent = meteor.targetUnitId;
  }
}
