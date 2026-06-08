import { CommunicationSystem } from '../models/CommunicationSystem';
import { SystemDisplayMode } from '../models/DataPacket';
import type { MainScene } from '../scenes/MainScene';

/**
 * ミッション判定・サーベイポイント描画・勝敗・gameState 公開を管理する。
 */
export class MissionManager {
  private scene: MainScene;

  // 調査対象ポイント
  public readonly surveyPoint = { x: 3000, y: 3000, radius: 200 };

  // 勝利条件: 調査ポイント内に10秒連続滞在
  private readonly WIN_STAY_MS = 10000;
  // shipId → そのユニットがポイントに入った時刻(ms)。ポイント外に出たら null 削除。
  private surveyEntryTimes: Map<string, number> = new Map();

  // ミッション達成状況キャッシュ（ChatWidget 用）
  private missionReach: boolean = false;

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
    this.scene.uiManager.showGameOver('MISSION SUCCESS', '調査対象ポイントへの10秒滞在を達成しました。');
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  /**
   * ミッション達成条件をチェックし、UI 表示を更新する。
   * 条件: 任意のユニットが調査ポイントに10秒連続滞在
   */
  private checkWinLoss(): void {
    if (this.gameOver) return;

    const now = this.scene.getTimeElapsedMs();
    const activeUnits = Array.from(this.scene.spaceships.values());
    let reachSuccess = false;
    let staySeconds = 0;

    for (const ship of activeUnits) {
      const dist = CommunicationSystem.getDistance(ship.x, ship.y, this.surveyPoint.x, this.surveyPoint.y);
      if (dist < this.surveyPoint.radius) {
        reachSuccess = true;
        if (!this.surveyEntryTimes.has(ship.id)) {
          this.surveyEntryTimes.set(ship.id, now);
        }
        const elapsed = now - this.surveyEntryTimes.get(ship.id)!;
        staySeconds = Math.max(staySeconds, Math.floor(elapsed / 1000));
        if (elapsed >= this.WIN_STAY_MS) {
          this.win();
          return;
        }
      } else {
        // ポイント外に出たらリセット
        this.surveyEntryTimes.delete(ship.id);
      }
    }

    this.missionReach = reachSuccess;

    const mLog = document.getElementById('mission-log');
    if (mLog) {
      const stayDisplay = reachSuccess ? ` (${staySeconds}/${this.WIN_STAY_MS / 1000}秒)` : '';
      mLog.innerHTML = `<span style="color:${reachSuccess ? '#4ade80' : '#94a3b8'}">${reachSuccess ? '[x]' : '[ ]'} 調査ポイント到達${stayDisplay}</span>`;
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
      elapsedSeconds: Math.floor(this.scene.getTimeElapsedMs() / 1000),
      gameMode: this.scene.systemDisplayMode === SystemDisplayMode.CONTROL ? 'control' : 'combat',
      gameStatus: this.scene.isBriefingActive ? 'briefing' : this.gameOver ? 'won' : 'active',
    };
  }
}
