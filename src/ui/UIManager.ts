import { CommunicationSystem } from '../models/CommunicationSystem';
import { Spaceship } from '../models/Spaceship';
import { PacketType, FreqShort, FreqLong, SystemDisplayMode } from '../models/DataPacket';
import legacyDestroyerImg from '../assets/Space_Ship/Legacy_Destroyer.png';
import frigateImg from '../assets/Space_Ship/Frigate.png';
import legacyFrigateImg from '../assets/Space_Ship/Legacy_Frigate.png';
import destroyerImg from '../assets/Space_Ship/Destroyer.png';
import type { UnitType } from '../models/Spaceship';
import monitorVideoSrc from '../assets/Radio_Console/monitor_01.mp4';
import type { MainScene } from '../scenes/MainScene';

/**
 * UI/モーダル全般のマネージャ。
 * - GameOver パネル / Unit モーダル / 各種コントロール / スケールバー / アコーディオン
 * - DOM 取得・イベントハンドラ登録・状態更新を一元化
 *
 * Planet/Meteor モーダルは PlanetSystem / MeteorSystem 内で管理。
 */
export class UIManager {
  private scene: MainScene;

  // GameOver パネル
  private domGameOver: HTMLElement | null = null;
  private domGameTitle: HTMLElement | null = null;
  private domGameDesc: HTMLElement | null = null;

  // Unit モーダル
  private domUnitModal: HTMLElement | null = null;
  private domUnitTitle: HTMLElement | null = null;
  private domUnitType: HTMLElement | null = null;
  private domUnitLevel: HTMLElement | null = null;
  private unitModalSwipeStart: { x: number; y: number; time: number; scrollTop: number } | null = null;
  private domShortEnable: HTMLInputElement | null = null;
  private domShortFreq: HTMLSelectElement | null = null;
  private domLongEnable: HTMLInputElement | null = null;
  private domLongFreq: HTMLSelectElement | null = null;
  private domSendCmdBtn: HTMLElement | null = null;
  private domRgrContainer: HTMLElement | null = null;
  private domRgrList: HTMLElement | null = null;
  private domModalClose: HTMLElement | null = null;

  // 多重通信・光通信
  private domMultiplexEnable: HTMLInputElement | null = null;
  private domMultiplexMaster: HTMLSelectElement | null = null;
  private domMultiplexSpeed: HTMLSelectElement | null = null;
  private domMultiplexCipher: HTMLSelectElement | null = null;
  private domMultiplexRelay: HTMLInputElement | null = null;

  // レガシー星間通信 — 即時 ON/OFF トグルボタン
  private domLegacyToggleBtn: HTMLButtonElement | null = null;

  // TCP/IP 星間通信 — 即時 ON/OFF トグルボタン
  private domTcpIpToggleBtn: HTMLButtonElement | null = null;

  private domToggleStatusBtn: HTMLElement | null = null;
  private domScaleBarLine: HTMLElement | null = null;
  private domScaleBarText: HTMLElement | null = null;

  // 被害対処 UI 要素
  private domDmgStatusArmor: HTMLElement | null = null;
  private domDmgStatusComm: HTMLElement | null = null;
  private domDmgStatusWeapon: HTMLElement | null = null;
  private domDmgStatusTcpIp: HTMLElement | null = null;
  private domDmgStatusLegacy: HTMLElement | null = null;
  private domDmgStatusMultiplex: HTMLElement | null = null;
  private domDmgStatusOptical: HTMLElement | null = null;
  private domDmgSituation: HTMLElement | null = null;
  private domDmgTreatBtn: HTMLButtonElement | null = null;
  private domReconDroneBtn: HTMLButtonElement | null = null;

  // viz mode 切替の内部状態（CONTROL モード時のみ循環）
  private controlVizIndex = 0;
  private readonly controlVizModes: { key: 'circles' | 'dots' | 'quality'; label: string }[] = [
    { key: 'circles', label: 'サークル表示' },
    { key: 'dots', label: 'ライン表示' },
    { key: 'quality', label: '通信品質' }
  ];

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  /**
   * すべての DOM を取得し、イベントハンドラを登録する。
   * MainScene.create() の最初期に呼ぶ。
   */
  init(): void {
    this.bindGameOverDom();
    this.bindUnitModalDom();
    this.bindMultiplexDom();
    this.bindLegacyDom();
    this.bindTcpIpDom();
    this.bindStatusToggle();
    this.setupAccordions();
    this.setupMissionPanelToggle();
    this.bindAuxDom();
    this.bindSendCmdBtn();
    this.bindRoleAndModeToggles();
    this.bindModalClose();
    this.bindActionCycleBtn();
    this.bindNoiseMonitor();
    this.bindDamageDom();
  }

  /**
   * Unit モーダルを開く（他モーダルと排他）。
   */
  openUnit(): void {
    if (!this.scene.selectedUnitId || !this.domUnitModal) return;
    // 他モーダルを閉じる
    this.scene.closeOtherModals('unit');
    this.domUnitModal.classList.remove('hidden');
    this.applyModeToUnitModal();
    this.updateModalData();
  }

  /**
   * Unit モーダルを閉じる（他システムからの排他制御用）。
   */
  closeUnitModal(): void {
    this.scene.selectedUnitId = null;
    this.domUnitModal?.classList.add('hidden');
  }

  /**
   * 戦闘指揮 / 通信管制モードに応じて Unit モーダル表示要素を切り替える。
   * Repair Ship は星間通信 / レガシー星間通信 / 多重通信を使用不可のため、これらの UI を常に非表示にする。
   */
  applyModeToUnitModal(): void {
    const isCombat = this.scene.systemDisplayMode === SystemDisplayMode.COMBAT;
    const unit = this.scene.selectedUnitId ? this.scene.spaceships.get(this.scene.selectedUnitId) : null;
    const isRepair = unit?.isRepairShip() ?? false;
    ['tcpip-toggle-btn',
     'legacy-toggle-btn',
     'multiplex-group-btn', 'multiplex-group-content',
     'optical-group-btn', 'optical-group-content',
     'transfer-group-btn', 'transfer-group-content',
     'toggle-status-btn',
     'noise-monitor-btn',
     'unit-data-container'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', isCombat);
    });
    // 戦闘指揮モードでは背景雑音モニタを閉じる
    if (isCombat) this.closeNoiseMonitor();
    // Repair Ship: 星間通信 / レガシー星間通信 / 多重通信は非表示・運用不可
    if (isRepair) {
      ['tcpip-toggle-btn',
       'legacy-toggle-btn',
       'multiplex-group-btn', 'multiplex-group-content']
        .forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.add('hidden');
        });
    }
    // 戦闘モード時は rgr-container を強制非表示。通信管制モード時はユーザートグル状態を維持。
    const rgrEl = document.getElementById('rgr-container');
    if (rgrEl && isCombat) rgrEl.classList.add('hidden');
    const actionContainer = document.getElementById('action-btn-container');
    if (actionContainer) actionContainer.classList.toggle('hidden', !isCombat);

    // 被害対処アコーディオン: 戦闘指揮モードのみ表示
    const dmgBtn = document.getElementById('damage-group-btn');
    const dmgContent = document.getElementById('damage-group-content');
    if (dmgBtn) dmgBtn.classList.toggle('hidden', !isCombat);
    if (dmgContent) {
      dmgContent.classList.toggle('hidden', !isCombat);
      if (!isCombat) {
        dmgContent.classList.remove('open');
        if (dmgBtn) dmgBtn.classList.remove('open');
      }
    }

    // 残弾表示: 戦闘指揮モードのみ表示
    const ammoContainer = document.getElementById('ammo-container');
    if (ammoContainer) ammoContainer.style.display = isCombat ? 'block' : 'none';
    this.updateReconDroneButtonState();
  }

  /**
   * Unit モーダルが開いていれば中身を更新する（ゲームループから毎フレーム呼ばれる）。
   */
  updateActiveModalDataIfOpen(): void {
    if (!this.scene.selectedUnitId) return;
    if (!this.domUnitModal || this.domUnitModal.classList.contains('hidden')) return;
    // ユニットが消滅していたらモーダルを閉じる
    if (!this.scene.spaceships.has(this.scene.selectedUnitId)) {
      this.closeUnitModal();
      return;
    }
    this.updateModalData();
    this.applyModeToUnitModal();
  }

  /**
   * スケールバーをカメラズームに応じて更新する。
   */
  updateScaleBar(zoom: number): void {
    if (!this.domScaleBarLine || !this.domScaleBarText) return;
    let distanceKm = 100;
    if (zoom < 0.5) distanceKm = 500;
    else if (zoom < 0.8) distanceKm = 200;
    else if (zoom > 1.5) distanceKm = 50;
    const pxPerKm = 1;
    const lengthPx = distanceKm * zoom * pxPerKm;
    this.domScaleBarLine.style.width = `${lengthPx}px`;
    this.domScaleBarText.textContent = `${distanceKm} km`;
  }

  /**
   * GameOver パネルを勝敗表示で開く。
   */
  showGameOver(title: string, desc: string): void {
    if (!this.domGameOver) return;
    this.domGameOver.classList.remove('hidden');
    if (this.domGameTitle) this.domGameTitle.textContent = title;
    if (this.domGameDesc) this.domGameDesc.textContent = desc;
  }

  // ==================== private: DOM bind ====================

  private bindGameOverDom(): void {
    this.domGameOver = document.getElementById('game-over-panel');
    this.domGameTitle = document.getElementById('game-over-title');
    this.domGameDesc = document.getElementById('game-over-desc');
  }

  private bindUnitModalDom(): void {
    this.domUnitModal = document.getElementById('unit-modal');
    this.domUnitTitle = document.getElementById('unit-title');
    this.domUnitType = document.getElementById('unit-type');
    this.domUnitLevel = document.getElementById('unit-level');
    this.domShortEnable = document.getElementById('short-enable') as HTMLInputElement | null;
    this.domShortFreq = document.getElementById('short-freq') as HTMLSelectElement | null;
    this.domLongEnable = document.getElementById('long-enable') as HTMLInputElement | null;
    this.domLongFreq = document.getElementById('long-freq') as HTMLSelectElement | null;

    // ユーザー操作で発火した時だけ ship に反映
    const updateLocal = (e?: Event) => {
      if (e && e.isTrusted && this.scene.selectedUnitId) {
        const ship = this.scene.spaceships.get(this.scene.selectedUnitId);
        if (ship) {
          ship.isShortEnabled = this.domShortEnable?.checked || false;
          ship.shortFreq = (this.domShortFreq?.value as FreqShort);
          ship.isLongEnabled = this.domLongEnable?.checked || false;
          ship.longFreq = (this.domLongFreq?.value as FreqLong);
        }
      }
    };
    if (this.domShortEnable) this.domShortEnable.onchange = updateLocal;
    if (this.domShortFreq) this.domShortFreq.onchange = updateLocal;
    if (this.domLongEnable) this.domLongEnable.onchange = updateLocal;
    if (this.domLongFreq) this.domLongFreq.onchange = updateLocal;
    this.bindUnitModalSwipeClose();
  }

  private bindUnitModalSwipeClose(): void {
    if (!this.domUnitModal) return;

    this.domUnitModal.addEventListener('pointerdown', (e: PointerEvent) => {
      this.unitModalSwipeStart = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        scrollTop: this.domUnitModal!.scrollTop,
      };
    });

    this.domUnitModal.addEventListener('pointerup', (e: PointerEvent) => {
      if (!this.unitModalSwipeStart) return;
      const dx = e.clientX - this.unitModalSwipeStart.x;
      const dy = e.clientY - this.unitModalSwipeStart.y;
      const elapsed = Date.now() - this.unitModalSwipeStart.time;
      const startScrollTop = this.unitModalSwipeStart.scrollTop;
      this.unitModalSwipeStart = null;

      // スクロール位置が先頭のときのみ下フリックを閉じる操作として扱う
      if (startScrollTop <= 5 && dy > 60 && Math.abs(dy) > Math.abs(dx) * 1.4 && elapsed < 700) {
        this.closeUnitModal();
      }
    });

    this.domUnitModal.addEventListener('pointercancel', () => {
      this.unitModalSwipeStart = null;
    });
  }

  private bindMultiplexDom(): void {
    this.domMultiplexEnable = document.getElementById('multiplex-enable') as HTMLInputElement | null;
    this.domMultiplexMaster = document.getElementById('multiplex-master') as HTMLSelectElement | null;
    this.domMultiplexSpeed = document.getElementById('multiplex-speed') as HTMLSelectElement | null;
    this.domMultiplexCipher = document.getElementById('multiplex-cipher') as HTMLSelectElement | null;
    this.domMultiplexRelay = document.getElementById('multiplex-relay') as HTMLInputElement | null;

    const updateMultiplex = (e?: Event) => {
      if (e && e.isTrusted && this.scene.selectedUnitId) {
        const ship = this.scene.spaceships.get(this.scene.selectedUnitId);
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
    if (this.domMultiplexEnable) this.domMultiplexEnable.onchange = updateMultiplex;
    if (this.domMultiplexMaster) this.domMultiplexMaster.onchange = updateMultiplex;
    if (this.domMultiplexSpeed) this.domMultiplexSpeed.onchange = updateMultiplex;
    if (this.domMultiplexCipher) this.domMultiplexCipher.onchange = updateMultiplex;
    if (this.domMultiplexRelay) this.domMultiplexRelay.onchange = updateMultiplex;
  }

  private bindLegacyDom(): void {
    this.domLegacyToggleBtn = document.getElementById('legacy-toggle-btn') as HTMLButtonElement | null;
    if (this.domLegacyToggleBtn) {
      this.domLegacyToggleBtn.onclick = () => {
        if (!this.scene.selectedUnitId) return;
        const ship = this.scene.spaceships.get(this.scene.selectedUnitId);
        if (!ship) return;
        ship.isLegacyEnabled = !ship.isLegacyEnabled;
        // 有効化時は同時発信を避けるため位相をずらす
        if (ship.isLegacyEnabled) {
          ship.legacyTimer = Math.random() * 2000;
        }
        this.applyToggleBtnState(this.domLegacyToggleBtn!, ship.isLegacyEnabled);
      };
    }
  }

  private bindTcpIpDom(): void {
    this.domTcpIpToggleBtn = document.getElementById('tcpip-toggle-btn') as HTMLButtonElement | null;
    if (this.domTcpIpToggleBtn) {
      this.domTcpIpToggleBtn.onclick = () => {
        if (!this.scene.selectedUnitId) return;
        const ship = this.scene.spaceships.get(this.scene.selectedUnitId);
        if (!ship) return;
        ship.isTcpIpEnabled = !ship.isTcpIpEnabled;
        // 有効化時はクールダウンをリセット（即送信可能に）
        if (ship.isTcpIpEnabled) {
          ship.tcpIpCooldown = 0;
        }
        this.applyToggleBtnState(this.domTcpIpToggleBtn!, ship.isTcpIpEnabled);
      };
    }
  }

  /** 即時トグルボタンの ON/OFF 状態を data-enabled 属性に反映 */
  private applyToggleBtnState(btn: HTMLButtonElement, enabled: boolean): void {
    btn.setAttribute('data-enabled', enabled ? 'true' : 'false');
  }

  private bindStatusToggle(): void {
    this.domToggleStatusBtn = document.getElementById('toggle-status-btn');
    if (this.domToggleStatusBtn) {
      this.domToggleStatusBtn.onclick = () => {
        if (!this.domRgrContainer) return;
        const isHidden = this.domRgrContainer.classList.contains('hidden');
        this.closeAllExpandable();
        if (isHidden) {
          this.domRgrContainer.classList.remove('hidden');
          this.domToggleStatusBtn!.textContent = '通信状況 ▲';
          this.domToggleStatusBtn!.classList.add('active');
        }
      };
    }
  }

  private closeNoiseMonitor(): void {
    const cont = document.getElementById('noise-monitor-video-container') as HTMLElement | null;
    const video = document.getElementById('noise-monitor-video') as HTMLVideoElement | null;
    const btn = document.getElementById('noise-monitor-btn');
    if (cont) cont.style.display = 'none';
    if (video) { video.pause(); video.src = ''; }
    if (btn) { btn.textContent = '背景雑音 ▼'; btn.classList.remove('active'); }
  }

  private closeRgrContainer(): void {
    if (this.domRgrContainer) this.domRgrContainer.classList.add('hidden');
    if (this.domToggleStatusBtn) {
      this.domToggleStatusBtn.textContent = '通信状況 ▼';
      this.domToggleStatusBtn.classList.remove('active');
    }
  }

  /** 多重通信・光通信・通信状況・転送設定・背景雑音を全て閉じる（排他開閉用） */
  private closeAllExpandable(): void {
    document.getElementById('multiplex-group-btn')?.classList.remove('open');
    document.getElementById('multiplex-group-content')?.classList.remove('open');
    document.getElementById('optical-group-btn')?.classList.remove('open');
    document.getElementById('optical-group-content')?.classList.remove('open');
    document.getElementById('transfer-group-content')?.classList.remove('open');
    const tbtn = document.getElementById('transfer-group-btn');
    if (tbtn) { tbtn.textContent = '転送設定 ▼'; tbtn.classList.remove('active'); }
    this.closeRgrContainer();
    this.closeNoiseMonitor();
  }

  private setupAccordions(): void {
    // 排他開閉アコーディオン（多重通信・光通信）: 開く前に他の全展開要素を閉じる
    const setupExclusive = (btnId: string, contentId: string) => {
      const btn = document.getElementById(btnId);
      const content = document.getElementById(contentId);
      if (btn && content) {
        btn.onclick = () => {
          const isOpen = content.classList.contains('open');
          this.closeAllExpandable();
          if (!isOpen) {
            btn.classList.add('open');
            content.classList.add('open');
          }
        };
      }
    };
    setupExclusive('multiplex-group-btn', 'multiplex-group-content');
    setupExclusive('optical-group-btn', 'optical-group-content');

    // 転送設定: アコーディオンクラス未使用・ボタンテキストで開閉表示（排他）
    const transferBtn = document.getElementById('transfer-group-btn');
    const transferContent = document.getElementById('transfer-group-content');
    if (transferBtn && transferContent) {
      transferBtn.onclick = () => {
        const isOpen = transferContent.classList.contains('open');
        this.closeAllExpandable();
        if (!isOpen) {
          transferContent.classList.add('open');
          transferBtn.textContent = '転送設定 ▲';
          transferBtn.classList.add('active');
        }
      };
    }

    // 被害対処は戦闘指揮モード専用のため排他対象外（従来通りトグル）
    const dmgBtn = document.getElementById('damage-group-btn');
    const dmgContent = document.getElementById('damage-group-content');
    if (dmgBtn && dmgContent) {
      dmgBtn.onclick = () => {
        dmgBtn.classList.toggle('open');
        dmgContent.classList.toggle('open');
      };
    }

    // 矢印ボタンのトグル: right → left → both → right
    const directionCycle: Record<string, string> = { right: 'left', left: 'both', both: 'right' };
    const directionLabel: Record<string, string> = { right: '▶', left: '◀', both: '◀▶' };
    document.querySelectorAll<HTMLButtonElement>('.transfer-arrow-btn').forEach(btn => {
      btn.onclick = () => {
        const current = btn.dataset.direction ?? 'right';
        const next = directionCycle[current] ?? 'right';
        btn.dataset.direction = next;
        btn.textContent = directionLabel[next];
      };
    });
  }

  private setupMissionPanelToggle(): void {
    const missionToggle = document.getElementById('mission-toggle');
    const missionPanel = document.getElementById('mission-panel');
    if (missionToggle && missionPanel) {
      missionToggle.onclick = () => {
        const isCollapsed = missionPanel.classList.toggle('collapsed');
        missionToggle.setAttribute('aria-expanded', String(!isCollapsed));
      };
    }
  }

  private bindAuxDom(): void {
    this.domSendCmdBtn = document.getElementById('send-cmd-btn');
    this.domRgrContainer = document.getElementById('rgr-container');
    this.domRgrList = document.getElementById('rgr-list');
    this.domModalClose = document.getElementById('unit-modal-close');
    this.domScaleBarLine = document.getElementById('scale-bar-line');
    this.domScaleBarText = document.getElementById('scale-bar-text');
  }

  private bindSendCmdBtn(): void {
    const btn = document.getElementById('send-cmd-btn');
    if (!btn) return;
    btn.onclick = () => {
      const hq = this.scene.spaceships.get('L-Dest1');
      if (hq && hq.isNodeActive) {
        const shortFreq = (document.getElementById('short-freq') as HTMLSelectElement).value as FreqShort;
        const longFreq = (document.getElementById('long-freq') as HTMLSelectElement).value as FreqLong;
        const isShortEnabled = (document.getElementById('short-enable') as HTMLInputElement).checked;
        const isLongEnabled = (document.getElementById('long-enable') as HTMLInputElement).checked;
        hq.queue.push({
          id: `cmd-broadcast-${Date.now()}-${hq.id}`,
          type: PacketType.CMD,
          createdAt: Date.now(),
          originShipId: 'L-Dest1',
          targetShipId: undefined, // Broadcast
          payload: { shortFreq, longFreq, isShortEnabled, isLongEnabled }
        });
        this.scene.showFloatingText(hq.x, hq.y, '全軍へ指示発令', '#f59e0b');
      }
    };
  }

  private bindRoleAndModeToggles(): void {
    const roleBtn = document.getElementById('toggle-role-btn');
    if (roleBtn) {
      roleBtn.onclick = () => {
        if (this.scene.selectedUnitId) this.scene.toggleNode(this.scene.selectedUnitId);
      };
    }

    const modeBtn = document.getElementById('toggle-mode-btn');
    const vizBtn = document.getElementById('viz-cycle-btn');

    if (vizBtn) {
      vizBtn.onclick = () => {
        if (this.scene.systemDisplayMode === SystemDisplayMode.CONTROL) {
          this.controlVizIndex = (this.controlVizIndex + 1) % this.controlVizModes.length;
          this.scene.vizMode = this.controlVizModes[this.controlVizIndex].key;
          vizBtn.textContent = this.controlVizModes[this.controlVizIndex].label;
        }
        // COMBAT モードでは循環せず「射程」固定
      };
    }

    if (modeBtn) {
      modeBtn.onclick = () => {
        this.scene.systemDisplayMode = this.scene.systemDisplayMode === SystemDisplayMode.CONTROL
          ? SystemDisplayMode.COMBAT
          : SystemDisplayMode.CONTROL;
        const isControl = this.scene.systemDisplayMode === SystemDisplayMode.CONTROL;
        modeBtn.textContent = isControl ? 'モード：通信管制' : 'モード：戦闘指揮';
        modeBtn.className = isControl ? 'mode-toggle-btn' : 'mode-toggle-btn combat';
        if (this.scene.selectedUnitId && this.domUnitModal && !this.domUnitModal.classList.contains('hidden')) {
          this.applyModeToUnitModal();
        }
        if (vizBtn) {
          if (isControl) {
            this.controlVizIndex = 0;
            this.scene.vizMode = 'circles';
            vizBtn.textContent = 'サークル表示';
          } else {
            this.scene.vizMode = 'range';
            vizBtn.textContent = '射程';
          }
        }
      };
    }
  }

  private bindModalClose(): void {
    if (this.domModalClose) {
      this.domModalClose.onclick = () => {
        this.scene.selectedUnitId = null;
        this.domUnitModal?.classList.add('hidden');
      };
    }
  }

  private bindActionCycleBtn(): void {
    const actionCycleBtn = document.getElementById('action-cycle-btn');
    if (actionCycleBtn) {
      actionCycleBtn.onclick = () => {
        const cycle: Array<'attack' | 'warning'> = ['attack', 'warning'];
        const labels: Record<string, string> = { attack: '攻撃', warning: '警告' };
        const next = cycle[(cycle.indexOf(this.scene.selectedAction) + 1) % cycle.length];
        this.scene.selectedAction = next;
        actionCycleBtn.textContent = labels[next];
      };
    }

    this.domReconDroneBtn = document.getElementById('recon-drone-btn') as HTMLButtonElement | null;
    if (this.domReconDroneBtn) {
      this.domReconDroneBtn.onclick = () => {
        this.scene.beginReconDroneTargeting();
        this.updateReconDroneButtonState();
      };
    }

    // 緊急離脱ボタン: 横付け修理を解除し両艦を自由移動に戻す
    const undockBtn = document.getElementById('emergency-undock-btn');
    if (undockBtn) {
      undockBtn.onclick = () => {
        if (this.scene.selectedUnitId) {
          this.scene.emergencyUndock(this.scene.selectedUnitId);
          this.updateModalData();
        }
      };
    }
  }

  public updateReconDroneButtonState(): void {
    if (!this.domReconDroneBtn) return;
    const selectedId = this.scene.selectedUnitId;
    const isDestroyed = selectedId ? this.scene.isReconDroneDestroyedForUnit(selectedId) : false;
    const isTargeting = selectedId ? this.scene.isReconDroneTargetingUnit(selectedId) : false;
    if (isDestroyed) {
      this.domReconDroneBtn.textContent = '索敵ドローン（消滅）';
      this.domReconDroneBtn.style.background = 'rgba(100,116,139,0.12)';
      this.domReconDroneBtn.style.borderColor = 'rgba(100,116,139,0.3)';
      this.domReconDroneBtn.style.color = '#64748b';
      this.domReconDroneBtn.disabled = true;
    } else if (isTargeting) {
      this.domReconDroneBtn.textContent = '索敵ポイント指定中';
      this.domReconDroneBtn.style.background = 'rgba(250,204,21,0.18)';
      this.domReconDroneBtn.style.borderColor = 'rgba(250,204,21,0.55)';
      this.domReconDroneBtn.style.color = '#fde68a';
      this.domReconDroneBtn.disabled = false;
    } else {
      this.domReconDroneBtn.textContent = '索敵ドローン';
      this.domReconDroneBtn.style.background = 'rgba(56,189,248,0.16)';
      this.domReconDroneBtn.style.borderColor = 'rgba(56,189,248,0.45)';
      this.domReconDroneBtn.style.color = '#7dd3fc';
      this.domReconDroneBtn.disabled = false;
    }
  }

  // 被害対処タブ: DOM参照取得と「被害対処 実行」ボタンのハンドラ登録
  private bindDamageDom(): void {
    this.domDmgStatusArmor = document.getElementById('dmg-status-armor');
    this.domDmgStatusComm = document.getElementById('dmg-status-comm');
    this.domDmgStatusWeapon = document.getElementById('dmg-status-weapon');
    this.domDmgStatusTcpIp = document.getElementById('dmg-status-tcpip');
    this.domDmgStatusLegacy = document.getElementById('dmg-status-legacy');
    this.domDmgStatusMultiplex = document.getElementById('dmg-status-multiplex');
    this.domDmgStatusOptical = document.getElementById('dmg-status-optical');
    this.domDmgSituation = document.getElementById('dmg-situation');
    this.domDmgTreatBtn = document.getElementById('dmg-treat-btn') as HTMLButtonElement | null;
    if (this.domDmgTreatBtn) {
      this.domDmgTreatBtn.onclick = () => this.onDamageTreatClick();
    }

    // 武器行クリックで詳細行をトグル
    const weaponRow = document.getElementById('dmg-weapon-row');
    const weaponDetail = document.getElementById('dmg-weapon-detail');
    const weaponToggle = document.getElementById('dmg-weapon-toggle');
    if (weaponRow && weaponDetail && weaponToggle) {
      weaponRow.onclick = () => {
        const isHidden = weaponDetail.style.display === 'none';
        weaponDetail.style.display = isHidden ? 'table-row' : 'none';
        weaponToggle.textContent = isHidden ? '▲' : '▼';
      };
    }
  }

  // 「被害対処 実行」: 現在の active 被害を全て treating に遷移させる
  private onDamageTreatClick(): void {
    if (!this.scene.selectedUnitId) return;
    const ship = this.scene.spaceships.get(this.scene.selectedUnitId);
    if (!ship) return;
    const now = Date.now();
    let started = 0;
    for (const d of ship.damages) {
      if (d.phase === 'active') {
        d.phase = 'treating';
        d.treatStartedAt = now;
        started++;
      }
    }
    if (started > 0) {
      window.__chatWidget?.pushSystemMessage(`${ship.id} 被害対処を開始（${started}件）`);
      this.scene.showFloatingText(ship.x, ship.y, '被害対処 開始', '#fbbf24');
      this.updateModalData();
    }
  }

  private statusColor(level: 'GOOD' | 'POOR' | 'UNABLE'): string {
    if (level === 'GOOD') return '#4ade80';
    if (level === 'POOR') return '#facc15';
    return '#ef4444';
  }

  private bindNoiseMonitor(): void {
    const NOISE_MONITOR_CONFIG: Record<string, { src: string; message: string }> = {
      none: { src: monitorVideoSrc, message: '干渉はありません' },
    };
    const btn = document.getElementById('noise-monitor-btn');
    const cont = document.getElementById('noise-monitor-video-container') as HTMLElement | null;
    const video = document.getElementById('noise-monitor-video') as HTMLVideoElement | null;
    if (btn && cont && video) {
      btn.onclick = () => {
        const isVisible = cont.style.display === 'block';
        this.closeAllExpandable();
        if (!isVisible) {
          const cfg = NOISE_MONITOR_CONFIG['none'];
          video.src = cfg.src;
          cont.style.display = 'block';
          btn.textContent = '背景雑音 ▲';
          btn.classList.add('active');
          window.__chatWidget?.pushSystemMessage(cfg.message);
        }
      };
      video.onclick = () => {
        this.closeNoiseMonitor();
      };
    }
  }

  // ==================== private: モーダル更新 ====================

  /**
   * 選択中ユニットの全データを Unit モーダルに反映する。
   */
  private updateModalData(): void {
    if (!this.scene.selectedUnitId) return;
    const unit = this.scene.spaceships.get(this.scene.selectedUnitId);
    if (!unit) return;

    // 連接マスター候補を動的更新（ドロップダウンには艦のIDのみを表示）
    if (this.domMultiplexMaster) {
      const currentMasterId = unit.selectedMasterId;
      this.domMultiplexMaster.innerHTML = '<option value="">--</option>';
      this.scene.spaceships.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.id;
        this.domMultiplexMaster!.appendChild(opt);
      });
      this.domMultiplexMaster.value = currentMasterId || '';
    }

    // 新規 3 種 (Light Carrier / Carrier / Cruiser) は専用画像が未生成のため
    // 暫定的に Destroyer の画像を流用する。Gemini で生成完了後に import を差し替える。
    const shipImageMap: Partial<Record<UnitType, string>> = {
      'Legacy Destroyer': legacyDestroyerImg,
      'Destroyer':        destroyerImg,
      'Legacy Frigate':   legacyFrigateImg,
      'Frigate':          frigateImg,
      'Light Carrier':    destroyerImg,
      'Carrier':          destroyerImg,
      'Cruiser':          destroyerImg,
    };
    const shipImg = document.getElementById('unit-ship-image') as HTMLImageElement | null;
    if (shipImg) {
      const imgSrc = shipImageMap[unit.unitType];
      if (imgSrc) {
        shipImg.src = imgSrc;
        shipImg.style.display = '';
      } else {
        shipImg.removeAttribute('src');
        shipImg.style.display = 'none';
      }
    }
    if (this.domUnitTitle) this.domUnitTitle.textContent = unit.id;
    if (this.domUnitType) this.domUnitType.textContent = unit.unitType;
    if (this.domUnitLevel) this.domUnitLevel.textContent = String(unit.level);

    if (this.domShortEnable) this.domShortEnable.checked = unit.isShortEnabled;
    if (this.domShortFreq) this.domShortFreq.value = unit.shortFreq;
    if (this.domLongEnable) this.domLongEnable.checked = unit.isLongEnabled;
    if (this.domLongFreq) this.domLongFreq.value = unit.longFreq;

    if (this.domMultiplexEnable) this.domMultiplexEnable.checked = unit.isMultiplexEnabled;
    if (this.domMultiplexMaster) this.domMultiplexMaster.value = unit.selectedMasterId || '';
    if (this.domMultiplexSpeed) this.domMultiplexSpeed.value = unit.multiplexSpeed;
    if (this.domMultiplexCipher) this.domMultiplexCipher.value = unit.multiplexCipher;
    if (this.domMultiplexRelay) this.domMultiplexRelay.checked = unit.isOpticalRelayEnabled;

    if (this.domLegacyToggleBtn) this.applyToggleBtnState(this.domLegacyToggleBtn, unit.isLegacyEnabled);
    if (this.domTcpIpToggleBtn) this.applyToggleBtnState(this.domTcpIpToggleBtn, unit.isTcpIpEnabled);

    // HQ かつ active な場合のみ「指令送信」ボタンを表示
    if (unit.id === 'L-Dest1' && unit.isNodeActive) {
      this.domSendCmdBtn?.classList.remove('hidden');
    } else {
      this.domSendCmdBtn?.classList.add('hidden');
    }

    const hpBar = document.getElementById('unit-hp-bar');
    if (hpBar) {
      const pct = unit.hp / unit.maxHp;
      hpBar.style.width = `${pct * 100}%`;
      hpBar.style.background = pct < 0.3 ? '#ef4444' : '#4ade80';
    }

    // 未送信データバー（queue.length / 10 を割合とし段階配色）
    const dataBar = document.getElementById('unit-data-bar');
    if (dataBar) {
      const dataPct = Math.min(1, unit.queue.length / 10);
      dataBar.style.width = `${dataPct * 100}%`;
      let color = '#38bdf8';            // <10%: 青
      if (dataPct >= 0.8) color = '#a855f7';      // 80%以上: 紫
      else if (dataPct >= 0.5) color = '#ef4444'; // 50〜80%: 赤
      else if (dataPct >= 0.1) color = '#facc15'; // 10〜50%: 黄
      dataBar.style.background = color;
    }

    // 緊急離脱ボタン: 横付け修理中（dockingPartnerId あり）のみ表示
    const undockBtn = document.getElementById('emergency-undock-btn');
    if (undockBtn) {
      undockBtn.classList.toggle('hidden', !unit.dockingPartnerId);
    }

    // === 被害対処タブの描画 ===
    if (this.domDmgStatusArmor) {
      this.domDmgStatusArmor.textContent = unit.combatEquipment.armor;
      this.domDmgStatusArmor.style.color = this.statusColor(unit.combatEquipment.armor);
    }
    if (this.domDmgStatusComm) {
      this.domDmgStatusComm.textContent = unit.combatEquipment.comm;
      this.domDmgStatusComm.style.color = this.statusColor(unit.combatEquipment.comm);
    }
    if (this.domDmgStatusTcpIp) {
      this.domDmgStatusTcpIp.textContent = unit.combatEquipment.tcpIp;
      this.domDmgStatusTcpIp.style.color = this.statusColor(unit.combatEquipment.tcpIp);
    }
    if (this.domDmgStatusLegacy) {
      this.domDmgStatusLegacy.textContent = unit.combatEquipment.legacy;
      this.domDmgStatusLegacy.style.color = this.statusColor(unit.combatEquipment.legacy);
    }
    if (this.domDmgStatusMultiplex) {
      this.domDmgStatusMultiplex.textContent = unit.combatEquipment.multiplex;
      this.domDmgStatusMultiplex.style.color = this.statusColor(unit.combatEquipment.multiplex);
    }
    if (this.domDmgStatusOptical) {
      this.domDmgStatusOptical.textContent = unit.combatEquipment.optical;
      this.domDmgStatusOptical.style.color = this.statusColor(unit.combatEquipment.optical);
    }
    if (this.domDmgStatusWeapon) {
      this.domDmgStatusWeapon.textContent = unit.combatEquipment.weapon;
      this.domDmgStatusWeapon.style.color = this.statusColor(unit.combatEquipment.weapon);
    }

    // 残弾表示
    const ammoMissile = document.getElementById('ammo-missile');
    const ammoLaser = document.getElementById('ammo-laser');
    const canShowMissile = unit.canEquipMissile();
    const ammoMissileRow = ammoMissile?.parentElement as HTMLElement | null;
    if (ammoMissileRow) ammoMissileRow.style.display = canShowMissile ? '' : 'none';
    if (ammoMissile) ammoMissile.textContent = String(unit.missileAmmo);
    if (ammoLaser) ammoLaser.textContent = String(unit.laserAmmo);

    // 武器詳細: missile/laser 個別ステータスと残弾
    const dmgWeaponMissile = document.getElementById('dmg-weapon-missile');
    const dmgWeaponLaser = document.getElementById('dmg-weapon-laser');
    const dmgWeaponMissileAmmo = document.getElementById('dmg-weapon-missile-ammo');
    const dmgWeaponLaserAmmo = document.getElementById('dmg-weapon-laser-ammo');
    const dmgWeaponMissileRow = dmgWeaponMissile?.closest('tr') as HTMLTableRowElement | null;
    if (dmgWeaponMissileRow) dmgWeaponMissileRow.style.display = canShowMissile ? '' : 'none';

    if (dmgWeaponMissile) {
      dmgWeaponMissile.textContent = unit.weaponStatus.missile;
      dmgWeaponMissile.style.color = this.statusColor(unit.weaponStatus.missile);
    }
    if (dmgWeaponLaser) {
      dmgWeaponLaser.textContent = unit.weaponStatus.laser;
      dmgWeaponLaser.style.color = this.statusColor(unit.weaponStatus.laser);
    }
    if (dmgWeaponMissileAmmo) {
      dmgWeaponMissileAmmo.textContent = `${unit.missileAmmo}/${unit.MISSILE_AMMO_MAX}`;
      dmgWeaponMissileAmmo.style.color = unit.missileAmmo === 0 ? '#ef4444' : '#94a3b8';
    }
    if (dmgWeaponLaserAmmo) {
      dmgWeaponLaserAmmo.textContent = `${unit.laserAmmo}/${unit.LASER_AMMO_MAX}`;
      dmgWeaponLaserAmmo.style.color = unit.laserAmmo === 0 ? '#ef4444' : '#94a3b8';
    }
    if (this.domDmgSituation) {
      if (unit.damages.length === 0) {
        // 被害なし: HPが満タンなら「被害なし」、減っていれば応急対処完了状態
        this.domDmgSituation.textContent = unit.hp < unit.maxHp ? '応急対処 完了' : '被害なし';
      } else {
        const sizeLabel = (s: 'small' | 'medium' | 'large') =>
          s === 'large' ? '大' : s === 'medium' ? '中' : '小';
        const parts = unit.damages.map(d => {
          const sz = sizeLabel(d.size);
          if (d.kind === 'fire') {
            return d.phase === 'treating' ? `${sz}火災 消火中` : `${sz}火災 発生`;
          } else {
            return d.phase === 'treating' ? `${sz}破口 漏洩対策中` : `${sz}破口 空気漏洩中`;
          }
        });
        this.domDmgSituation.textContent = parts.join('、');
      }
    }
    if (this.domDmgTreatBtn) {
      const hasActive = unit.damages.some(d => d.phase === 'active');
      this.domDmgTreatBtn.disabled = !hasActive;
      this.domDmgTreatBtn.style.opacity = hasActive ? '1' : '0.4';
      this.domDmgTreatBtn.style.cursor = hasActive ? 'pointer' : 'not-allowed';

      // 被害対処アコーディオンと実行ボタンの強調表示を入れ替える:
      // - 折りたたみ時: アコーディオン本体を点滅させて発生を知らせる
      // - 展開時: 実行ボタンを点滅させて押下を促す
      const dmgGroupBtn = document.getElementById('damage-group-btn');
      const dmgGroupContent = document.getElementById('damage-group-content');
      const isOpen = dmgGroupContent?.classList.contains('open') ?? false;

      if (hasActive && !isOpen) {
        dmgGroupBtn?.classList.add('blinking');
        this.domDmgTreatBtn.classList.remove('blinking');
      } else if (hasActive && isOpen) {
        dmgGroupBtn?.classList.remove('blinking');
        this.domDmgTreatBtn.classList.add('blinking');
      } else {
        dmgGroupBtn?.classList.remove('blinking');
        this.domDmgTreatBtn.classList.remove('blinking');
      }
    }

    const roleBtn = document.getElementById('toggle-role-btn');
    if (roleBtn) {
      roleBtn.textContent = unit.isNodeActive ? 'ノード設定解除' : 'ノードに設定';
    }

    this.domShortEnable?.removeAttribute('disabled');
    this.domShortFreq?.removeAttribute('disabled');
    this.domLongEnable?.removeAttribute('disabled');
    this.domLongFreq?.removeAttribute('disabled');

    // 通信状況テーブル（行: 通信種別、列: 他ユニット）
    if (this.domRgrList) {
      const activeNodes = Array.from(this.scene.spaceships.values()).filter(s => s.isNodeActive);
      const commPlanet = this.scene.planetSystem.getCommPlanet();
      const tcpPlanet = this.scene.planetSystem.getTcpIpCommPlanet();
      const regularPlanets = this.scene.planetSystem.getRegularPlanets();
      const allPlanets = this.scene.planetSystem.getPlanets();
      const others = Array.from(this.scene.spaceships.values()).filter(s => s.id !== unit.id);

      // セル値を生成するヘルパー: GOOD（緑） / POOR（黄） / OFF（灰）
      const cellHtml = (canConnect: boolean, dropRate: number): string => {
        if (!canConnect) {
          return `<td style="text-align:center; color:#9ca3af; padding:3px 4px;">OFF</td>`;
        }
        const isGood = dropRate < 0.2;
        const color = isGood ? '#4ade80' : '#facc15';
        const label = isGood ? 'GOOD' : 'POOR';
        return `<td style="text-align:center; color:${color}; padding:3px 4px;">${label}</td>`;
      };

      // 各通信方式について、他ユニット全員のセルを生成する
      const buildRow = (
        label: string,
        compute: (other: Spaceship) => { canConnect: boolean; dropRate: number }
      ): string => {
        const cells = others.map(o => {
          const q = compute(o);
          return cellHtml(q.canConnect, q.dropRate);
        }).join('');
        return `<tr><th style="text-align:left; color:#94a3b8; padding:3px 6px; font-weight:normal;">${label}</th>${cells}</tr>`;
      };

      const headerCells = others.map(o => `<th style="text-align:center; color:#94a3b8; padding:3px 4px; font-weight:normal; font-size:10px;">${o.id}</th>`).join('');

      const tcpRow = buildRow('星間通信', o => tcpPlanet
        ? CommunicationSystem.getTcpIpLinkQuality(unit, o, regularPlanets)
        : { canConnect: false, dropRate: 1.0 });
      const legacyRow = buildRow('レガシー星間', o => commPlanet
        ? CommunicationSystem.getLegacyLinkQuality(unit, o, regularPlanets)
        : { canConnect: false, dropRate: 1.0 });
      const opticalRow = buildRow('多重通信', o => CommunicationSystem.getOpticalMultiplexQuality(unit, o, activeNodes));
      const radioRow = buildRow('光通信', o => CommunicationSystem.getLinkQuality(unit, o, activeNodes, allPlanets));

      this.domRgrList.innerHTML = `
        <table style="width:100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr><th></th>${headerCells}</tr>
          </thead>
          <tbody>
            ${tcpRow}
            ${legacyRow}
            ${opticalRow}
            ${radioRow}
          </tbody>
        </table>`;
    }
  }
}
