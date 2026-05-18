import { CommunicationSystem } from '../models/CommunicationSystem';
import { PacketType, SystemDisplayMode } from '../models/DataPacket';
import type { MainScene } from '../scenes/MainScene';

/**
 * ミッション判定・サーベイポイント描画・勝敗・gameState 公開を管理する。
 */
export class MissionManager {
  private scene: MainScene;

  // 調査対象ポイント
  public readonly surveyPoint = { x: 3000, y: 3000, radius: 200 };

  // ミッション達成状況キャッシュ（ChatWidget 用）
  private missionReach: boolean = false;
  private missionAllLinked: boolean = false;
  private missionData: boolean = false;

  // window.__gameState 書き出しの 60 フレームごとカウンタ
  private gameStateTickCounter: number = 0;

  private gameOver: boolean = false;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  /**
   * 毎フレーム呼ばれ、勝敗判定と gameState 公開を実施する。
   */
  update(): void {
    this.checkWinLoss();
    this.gameStateTickCounter++;
    if (this.gameStateTickCounter % 60 === 0) {
      this.exposeGameState();
    }
  }

  /**
   * サーベイポイント（黄色いパルス円）を描画する。draw 内から呼ぶ。
   */
  drawSurveyPoint(g: Phaser.GameObjects.Graphics, time: number): void {
    const pulseRate = (time % 2000) / 2000;
    g.lineStyle(3, 0xeab308, 0.6);
    g.strokeCircle(this.surveyPoint.x, this.surveyPoint.y, this.surveyPoint.radius);
    g.fillStyle(0xeab308, 0.1);
    g.fillCircle(this.surveyPoint.x, this.surveyPoint.y, this.surveyPoint.radius);
    g.lineStyle(2, 0xeab308, 0.6 * (1 - pulseRate));
    g.strokeCircle(this.surveyPoint.x, this.surveyPoint.y, this.surveyPoint.radius + (pulseRate * 100));

    // ラベル
    const labelKey = 'survey-point-label';
    let surveyText = this.scene.textLabels.get(labelKey);
    if (!surveyText) {
      surveyText = this.scene.add.text(
        this.surveyPoint.x, this.surveyPoint.y - this.surveyPoint.radius - 30, '調査対象ポイント',
        { fontSize: '18px', color: '#eab308', fontFamily: 'Rajdhani', fontStyle: 'bold' }
      ).setOrigin(0.5).setDepth(20);
      this.scene.textLabels.set(labelKey, surveyText);
    }
    surveyText.setPosition(this.surveyPoint.x, this.surveyPoint.y - this.surveyPoint.radius - 30);
  }

  /**
   * ゲームオーバー（敗北）状態にする。
   */
  lose(): void {
    this.gameOver = true;
    if (window.__chatWidget) window.__chatWidget.disabled = true;
    this.scene.uiManager.showGameOver('MISSION FAILED', '全部隊が消滅しました。');
  }

  private win(): void {
    this.gameOver = true;
    this.scene.uiManager.showGameOver('MISSION SUCCESS', '調査データをHQに回収し、全部隊の安全を確保しました。');
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  /**
   * 3つのミッション達成条件をチェックし、UI 表示を更新する。
   * 全達成で win() を呼ぶ。
   */
  private checkWinLoss(): void {
    if (this.gameOver) return;

    let reachSuccess = false;
    let allLinkedSuccess = true;
    let dataSuccess = false;

    const activeUnits = Array.from(this.scene.spaceships.values());
    const hqNode = activeUnits.find(s => s.id === 'L-Dest1');
    const nodes = activeUnits.filter(s => s.isNodeActive);
    const planets = this.scene.planetSystem.getPlanets();

    for (const ship of activeUnits) {
      // 1. Survey Point Reach
      const dist = CommunicationSystem.getDistance(ship.x, ship.y, this.surveyPoint.x, this.surveyPoint.y);
      if (dist < this.surveyPoint.radius) {
        reachSuccess = true;
        if (this.scene.getTimeElapsedMs() % 1000 < 20 && !ship.queue.some(p => p.type === PacketType.SURVEY_DATA)) {
          ship.receivePacket({
            id: `survey-${Date.now()}-${ship.id}`,
            type: PacketType.SURVEY_DATA,
            createdAt: Date.now(),
            originShipId: ship.id
          });
          this.scene.showFloatingText(ship.x, ship.y, 'データ収集', '#eab308');
        }
      }

      // 2. All Linked Success (HQ への接続を全船が確保)
      if (hqNode) {
        const { canConnect } = CommunicationSystem.getLinkQuality(ship, hqNode, nodes, planets);
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

    this.missionReach = reachSuccess;
    this.missionAllLinked = allLinkedSuccess;
    this.missionData = dataSuccess;

    if (reachSuccess && allLinkedSuccess && dataSuccess) {
      this.win();
    }
  }

  /**
   * window.__gameState にゲーム状態を書き出す（ChatWidget が Dify への
   * コンテキストとして利用）。
   */
  private exposeGameState(): void {
    const selectedHp = this.scene.selectedUnitId
      ? (this.scene.spaceships.get(this.scene.selectedUnitId)?.hp ?? null)
      : null;
    window.__gameState = {
      shipCount: this.scene.spaceships.size,
      selectedUnitId: this.scene.selectedUnitId,
      selectedUnitHp: selectedHp,
      missionReach: this.missionReach,
      missionAllLinked: this.missionAllLinked,
      missionData: this.missionData,
      elapsedSeconds: Math.floor(this.scene.getTimeElapsedMs() / 1000),
      gameMode: this.scene.systemDisplayMode === SystemDisplayMode.CONTROL ? 'control' : 'combat',
      gameStatus: this.scene.isBriefingActive ? 'briefing' : this.gameOver ? 'won' : 'active',
    };
  }
}
