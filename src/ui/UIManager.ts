import { CommunicationSystem } from '../models/CommunicationSystem';
import { PacketType, FreqShort, FreqLong, SystemDisplayMode } from '../models/DataPacket';
import legacyDestroyerImg from '../assets/Legacy_Destroyer.png';
import monitorVideoSrc from '../assets/monitor_01.mp4';
import type { MainScene } from '../scenes/MainScene';

/**
 * UI/モーダル全般のマネージャ。
 * - GameOver パネル / Unit モーダル / 各種コントロール / スケールバー / 経過時間 / アコーディオン
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

  // レガシー星間通信
  private domLegacyEnable: HTMLInputElement | null = null;

  private domToggleStatusBtn: HTMLElement | null = null;
  private domTimeDisplay: HTMLElement | null = null;
  private domScaleBarLine: HTMLElement | null = null;
  private domScaleBarText: HTMLElement | null = null;

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
    this.bindStatusToggle();
    this.setupAccordions();
    this.setupMissionPanelToggle();
    this.bindAuxDom();
    this.bindSendCmdBtn();
    this.bindRoleAndModeToggles();
    this.bindBriefing();
    this.bindModalClose();
    this.bindActionCycleBtn();
    this.bindNoiseMonitor();
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
   */
  applyModeToUnitModal(): void {
    const isCombat = this.scene.systemDisplayMode === SystemDisplayMode.COMBAT;
    ['legacy-group-btn', 'legacy-group-content',
     'multiplex-group-btn', 'multiplex-group-content',
     'optical-group-btn', 'optical-group-content',
     'toggle-status-btn', 'rgr-container'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', isCombat);
    });
    const actionContainer = document.getElementById('action-btn-container');
    if (actionContainer) actionContainer.classList.toggle('hidden', !isCombat);
  }

  /**
   * Unit モーダルが開いていれば中身を更新する（ゲームループから毎フレーム呼ばれる）。
   */
  updateActiveModalDataIfOpen(): void {
    if (!this.scene.selectedUnitId) return;
    if (!this.domUnitModal || this.domUnitModal.classList.contains('hidden')) return;
    this.updateModalData();
    this.applyModeToUnitModal();
  }

  /**
   * 経過時間表示の更新（draw 中に小数1桁、update 末尾に整数秒）。
   */
  updateTimeDisplay(timeElapsedMs: number, decimals: 0 | 1 = 0): void {
    if (!this.domTimeDisplay) return;
    if (decimals === 1) {
      this.domTimeDisplay.textContent = (timeElapsedMs / 1000).toFixed(1);
    } else {
      this.domTimeDisplay.textContent = Math.floor(timeElapsedMs / 1000).toString();
    }
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
    this.domLegacyEnable = document.getElementById('legacy-enable') as HTMLInputElement | null;
    if (this.domLegacyEnable) {
      this.domLegacyEnable.onchange = (e) => {
        if (!e.isTrusted || !this.scene.selectedUnitId) return;
        const ship = this.scene.spaceships.get(this.scene.selectedUnitId);
        if (ship && this.domLegacyEnable) {
          ship.isLegacyEnabled = this.domLegacyEnable.checked;
          // 有効化時は同時発信を避けるため位相をずらす
          if (ship.isLegacyEnabled) {
            ship.legacyTimer = Math.random() * 2000;
          }
        }
      };
    }
  }

  private bindStatusToggle(): void {
    this.domToggleStatusBtn = document.getElementById('toggle-status-btn');
    this.domTimeDisplay = document.getElementById('time-display');
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
  }

  private setupAccordions(): void {
    const setup = (btnId: string, contentId: string) => {
      const btn = document.getElementById(btnId);
      const content = document.getElementById(contentId);
      if (btn && content) {
        btn.onclick = () => {
          btn.classList.toggle('open');
          content.classList.toggle('open');
        };
      }
    };
    setup('legacy-group-btn', 'legacy-group-content');
    setup('multiplex-group-btn', 'multiplex-group-content');
    setup('optical-group-btn', 'optical-group-content');
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
      const hq = this.scene.spaceships.get('HQ Ship');
      if (hq && hq.isNodeActive) {
        const shortFreq = (document.getElementById('short-freq') as HTMLSelectElement).value as FreqShort;
        const longFreq = (document.getElementById('long-freq') as HTMLSelectElement).value as FreqLong;
        const isShortEnabled = (document.getElementById('short-enable') as HTMLInputElement).checked;
        const isLongEnabled = (document.getElementById('long-enable') as HTMLInputElement).checked;
        hq.queue.push({
          id: `cmd-broadcast-${Date.now()}-${hq.id}`,
          type: PacketType.CMD,
          createdAt: Date.now(),
          originShipId: 'HQ Ship',
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

  private bindBriefing(): void {
    const startBtn = document.getElementById('start-mission-btn');
    const overlay = document.getElementById('briefing-overlay');
    if (startBtn && overlay) {
      startBtn.onclick = () => {
        this.scene.endBriefing();
        overlay.classList.add('hidden');
      };
    } else {
      console.warn('Briefing overlay or start button not found!');
      this.scene.endBriefing();
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
    if (!actionCycleBtn) return;
    actionCycleBtn.onclick = () => {
      const cycle: Array<'attack' | 'jamming' | 'warning'> = ['attack', 'jamming', 'warning'];
      const labels: Record<string, string> = { attack: '攻撃', jamming: '妨害', warning: '警告' };
      const next = cycle[(cycle.indexOf(this.scene.selectedAction) + 1) % cycle.length];
      this.scene.selectedAction = next;
      actionCycleBtn.textContent = labels[next];
    };
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
        const cfg = NOISE_MONITOR_CONFIG['none'];
        video.src = cfg.src;
        cont.style.display = 'block';
        window.__chatWidget?.pushSystemMessage(cfg.message);
      };
      video.onclick = () => {
        cont.style.display = 'none';
        video.pause();
        video.src = '';
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

    // 連接マスター候補を動的更新
    if (this.domMultiplexMaster) {
      const currentMasterId = unit.selectedMasterId;
      this.domMultiplexMaster.innerHTML = '<option value="">-- 連接マスターを選択 --</option>';
      this.scene.spaceships.forEach(s => {
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
    if (this.domUnitLevel) this.domUnitLevel.textContent = '1';

    if (this.domShortEnable) this.domShortEnable.checked = unit.isShortEnabled;
    if (this.domShortFreq) this.domShortFreq.value = unit.shortFreq;
    if (this.domLongEnable) this.domLongEnable.checked = unit.isLongEnabled;
    if (this.domLongFreq) this.domLongFreq.value = unit.longFreq;

    if (this.domMultiplexEnable) this.domMultiplexEnable.checked = unit.isMultiplexEnabled;
    if (this.domMultiplexMaster) this.domMultiplexMaster.value = unit.selectedMasterId || '';
    if (this.domMultiplexSpeed) this.domMultiplexSpeed.value = unit.multiplexSpeed;
    if (this.domMultiplexCipher) this.domMultiplexCipher.value = unit.multiplexCipher;
    if (this.domMultiplexRelay) this.domMultiplexRelay.checked = unit.isOpticalRelayEnabled;

    if (this.domLegacyEnable) this.domLegacyEnable.checked = unit.isLegacyEnabled;

    // HQ かつ active な場合のみ「指令送信」ボタンを表示
    if (unit.id === 'HQ Ship' && unit.isNodeActive) {
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

    const roleBtn = document.getElementById('toggle-role-btn');
    if (roleBtn) {
      roleBtn.textContent = unit.isNodeActive ? 'ノード設定解除' : 'ノードに設定';
    }

    this.domShortEnable?.removeAttribute('disabled');
    this.domShortFreq?.removeAttribute('disabled');
    this.domLongEnable?.removeAttribute('disabled');
    this.domLongFreq?.removeAttribute('disabled');

    // 通信状況テーブル
    if (this.domRgrList) {
      this.domRgrList.innerHTML = '';
      const activeNodes = Array.from(this.scene.spaceships.values()).filter(s => s.isNodeActive);
      const commPlanet = this.scene.planetSystem.getCommPlanet();
      const regularPlanets = this.scene.planetSystem.getRegularPlanets();
      this.scene.spaceships.forEach(s => {
        if (s.id === unit.id) return;
        const { canConnect: canRadio, dropRate: radioRate } =
          CommunicationSystem.getLinkQuality(unit, s, activeNodes, this.scene.planetSystem.getPlanets());
        const { canConnect: canOpt, dropRate: optRate } =
          CommunicationSystem.getOpticalMultiplexQuality(unit, s, activeNodes);

        // レガシー星間通信：通信惑星が存在し、両端で isLegacyEnabled=true である必要あり
        let canLegacy = false;
        let legacyRate = 1.0;
        if (commPlanet) {
          const q = CommunicationSystem.getLegacyLinkQuality(unit, s, regularPlanets);
          canLegacy = q.canConnect;
          legacyRate = q.dropRate;
        }

        let radioColor = '#ef4444';
        let radioText = 'OFFLINE';
        if (canRadio) {
          radioColor = radioRate < 0.2 ? '#4ade80' : '#facc15';
          radioText = radioRate < 0.2 ? 'STABLE' : 'WEAK';
        }
        let optColor = '#ef4444';
        let optText = 'OFFLINE';
        if (canOpt) {
          optColor = optRate < 0.2 ? '#a855f7' : '#d8b4fe';
          optText = optRate < 0.2 ? 'STABLE' : 'WEAK';
        }
        let legacyColor = '#ef4444';
        let legacyText = 'OFFLINE';
        if (canLegacy) {
          legacyColor = legacyRate < 0.2 ? '#fde047' : '#fef08a';
          legacyText = legacyRate < 0.2 ? 'STABLE' : 'WEAK';
        }
        this.domRgrList!.innerHTML += `
          <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 10px;">
            <div style="color: #94a3b8; margin-bottom: 2px;">${s.id}</div>
            <div style="display: flex; justify-content: space-between;">
              <span>光通信: <span style="color: ${radioColor};">${radioText}</span></span>
              <span>多重通信: <span style="color: ${optColor};">${optText}</span></span>
            </div>
            <div style="margin-top: 2px;">
              <span>レガシー星間通信: <span style="color: ${legacyColor};">${legacyText}</span></span>
            </div>
          </div>`;
      });
    }
  }
}
