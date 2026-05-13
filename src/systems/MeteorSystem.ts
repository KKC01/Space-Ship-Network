import { Meteor, MeteorSize } from '../models/Meteor';
import { CommunicationSystem } from '../models/CommunicationSystem';
import { SystemDisplayMode } from '../models/DataPacket';
import type { MainScene } from '../scenes/MainScene';

/**
 * 隕石（メテオ）システム。
 * spawn・update・combat・draw・モーダル制御を一括管理する。
 */
export class MeteorSystem {
  private scene: MainScene;

  // 隕石本体・スプライト
  private meteors: Map<string, Meteor> = new Map();
  private meteorSprites: Map<string, Phaser.GameObjects.Image> = new Map();

  // スポーン制御
  private meteorSpawnTimer: number = 15000;
  private meteorCounter: number = 0;
  private meteorAlerted: Set<string> = new Set();

  // 描画用 Graphics（HPバー・警報リング・攻撃エフェクト）
  private meteorGraphics!: Phaser.GameObjects.Graphics;

  // 選択中の隕石ID（モーダル表示中の対象）
  private selectedMeteorId: string | null = null;

  // 隕石モーダル DOM
  private domMeteorModal: HTMLElement | null = null;
  private domMeteorModalClose: HTMLElement | null = null;
  private domMeteorId: HTMLElement | null = null;
  private domMeteorHpBar: HTMLElement | null = null;
  private domMeteorHpText: HTMLElement | null = null;
  private domMeteorSpeed: HTMLElement | null = null;
  private domMeteorTarget: HTMLElement | null = null;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  /**
   * DOM要素の取得・モーダル close ハンドラ登録・描画 Graphics の生成。
   * MainScene.create() から呼ぶ。
   */
  init(): void {
    this.meteorGraphics = this.scene.add.graphics().setDepth(6);

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
  }

  /**
   * 1フレーム分の状態更新（spawn / update / combat）。
   * MainScene.update() から呼ぶ。
   */
  update(dt: number, _time: number): void {
    this.meteorSpawnTimer -= dt;
    if (this.meteorSpawnTimer <= 0) {
      this.spawnMeteor();
    }
    this.updateMeteors(dt);
    this.handleMeteorCombat(dt);
  }

  /**
   * 描画 Graphics をクリアする。
   * MainScene.draw() 冒頭で他の Graphics と一緒に呼ぶ。
   */
  clearGraphics(): void {
    this.meteorGraphics.clear();
  }

  /**
   * 隕石の描画（スプライト位置更新・警報・攻撃エフェクト）。
   * MainScene.draw() 末尾から呼ぶ。
   */
  draw(time: number): void {
    this.drawMeteors(time);
  }

  /**
   * ワールド座標から隕石クリックを処理する。
   * @returns 隕石ヒットを処理した場合 true（呼び出し元は後続のクリック判定を中断）
   */
  handleClick(worldX: number, worldY: number): boolean {
    const METEOR_HIT_RADIUS = 60;
    for (const [mId, meteor] of this.meteors.entries()) {
      if (!meteor.isDetected || meteor.isDestroyed) continue;
      const dm = CommunicationSystem.getDistance(worldX, worldY, meteor.x, meteor.y);
      if (dm < METEOR_HIT_RADIUS) {
        const isCombatMode = this.scene.systemDisplayMode === SystemDisplayMode.COMBAT;
        if (isCombatMode && this.scene.selectedUnitId && this.scene.selectedAction === 'attack') {
          // 戦闘指揮モード + ユニット選択済み + 攻撃アクション → 攻撃指示
          const ship = this.scene.spaceships.get(this.scene.selectedUnitId);
          if (ship) {
            ship.attackTargetMeteorId = mId;
            window.__chatWidget?.pushSystemMessage(`${ship.id} → ${meteor.id} 攻撃します`);
            this.scene.showFloatingText(ship.x, ship.y, '攻撃指示', '#f87171');
          }
        } else {
          this.openMeteorModalById(mId);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * 隕石モーダルを開く（ユニット・惑星モーダルと排他）。
   */
  openMeteorModalById(meteorId: string): void {
    const meteor = this.meteors.get(meteorId);
    if (!meteor || !this.domMeteorModal) return;

    this.scene.closeOtherModals('meteor');

    this.selectedMeteorId = meteorId;
    this.domMeteorModal.classList.remove('hidden');
    this.updateMeteorModalData();
  }

  /**
   * 隕石モーダルを閉じる（他システムから呼ばれる排他制御用）。
   */
  closeModal(): void {
    this.selectedMeteorId = null;
    this.domMeteorModal?.classList.add('hidden');
  }

  /**
   * 現在の隕石一覧を返す（checkWinLoss 等から参照）。
   */
  getMeteors(): Map<string, Meteor> {
    return this.meteors;
  }

  /**
   * 隕石をスポーンする。ランダムなユニットから500kmの位置に出現。
   */
  private spawnMeteor(): void {
    this.meteorSpawnTimer = 15000 + Math.random() * 15000;

    const shipIds = Array.from(this.scene.spaceships.keys());
    if (shipIds.length === 0) return;

    const targetId = shipIds[Math.floor(Math.random() * shipIds.length)];
    const targetShip = this.scene.spaceships.get(targetId);
    if (!targetShip) return;

    this.meteorCounter++;
    const meteorId = `METEOR-${String(this.meteorCounter).padStart(3, '0')}`;

    // どのユニットからみても500km以上離れた位置から発動する
    let mx = 0, my = 0;
    let found = false;
    for (let attempts = 0; attempts < 100; attempts++) {
      const ships = Array.from(this.scene.spaceships.values());
      const baseShip = ships[Math.floor(Math.random() * ships.length)];
      const angle = Math.random() * Math.PI * 2;
      const testX = baseShip.x + Math.cos(angle) * 500;
      const testY = baseShip.y + Math.sin(angle) * 500;

      let allFar = true;
      for (const ship of this.scene.spaceships.values()) {
        const d = CommunicationSystem.getDistance(testX, testY, ship.x, ship.y);
        if (d < 490) {
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

    // フォールバック（ターゲットから500km）
    if (!found) {
      const angle = Math.random() * Math.PI * 2;
      mx = targetShip.x + Math.cos(angle) * 500;
      my = targetShip.y + Math.sin(angle) * 500;
    }

    // ランダムにサイズを決定
    const r = Math.random();
    let size: MeteorSize = 'SMALL';
    if (r < 0.1) size = 'LARGE';
    else if (r < 0.3) size = 'MEDIUM';
    else if (r < 0.7) size = 'SMALL';
    else size = 'TINY';

    const baseSpeed = 30;
    const speed = baseSpeed * (0.7 + Math.random() * 0.6); // ±30%: 21〜39
    const meteor = new Meteor(meteorId, mx, my, targetId, targetShip.x, targetShip.y, size, speed);
    this.meteors.set(meteorId, meteor);

    const sprite = this.scene.add.image(mx, my, 'meteor');
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
  private updateMeteors(dt: number): void {
    const toRemove: string[] = [];

    for (const [mId, meteor] of this.meteors.entries()) {
      if (meteor.isDestroyed) {
        toRemove.push(mId);
        continue;
      }

      meteor.update(dt);

      // 探知判定
      if (!meteor.isDetected) {
        for (const ship of this.scene.spaceships.values()) {
          const d = CommunicationSystem.getDistance(meteor.x, meteor.y, ship.x, ship.y);
          if (d <= 400) {
            meteor.isDetected = true;
            const sprite = this.meteorSprites.get(mId);
            if (sprite) sprite.setVisible(true);

            let warnMsg = '';
            if (meteor.sizeType === 'LARGE') warnMsg = '大型隕石、探知！';
            else if (meteor.sizeType === 'MEDIUM') warnMsg = '中型隕石、探知';
            else if (meteor.sizeType === 'SMALL') warnMsg = '小型隕石、探知';
            else if (meteor.sizeType === 'TINY') warnMsg = '極小隕石、探知中';

            window.__chatWidget?.pushSystemMessage(warnMsg);

            if (this.scene.systemDisplayMode === SystemDisplayMode.CONTROL) {
              window.__chatWidget?.pushSystemMessage('戦闘指揮に変更お願いします');
            }

            this.scene.showFloatingText(meteor.x, meteor.y, '隕石探知', '#fb923c');
            break;
          }
        }
      }

      // 衝突判定
      let hitShip = null;
      for (const ship of this.scene.spaceships.values()) {
        const distToTarget = CommunicationSystem.getDistance(meteor.x, meteor.y, ship.x, ship.y);
        if (distToTarget < meteor.radius + 15) {
          hitShip = ship;
          break;
        }
      }

      if (hitShip) {
        hitShip.hp = Math.max(0, hitShip.hp - meteor.hp);
        this.createCollisionEffect(meteor.x, meteor.y);
        this.scene.showFloatingText(hitShip.x, hitShip.y, `衝突 -${meteor.hp} HP`, '#ef4444');

        if (hitShip.hp <= 0) {
          this.createCollisionEffect(hitShip.x, hitShip.y);
          window.__chatWidget?.pushSystemMessage(`${hitShip.id} 通信途絶！`);
          this.scene.spaceships.delete(hitShip.id);
          const sg = this.scene.shipGraphics.get(hitShip.id);
          if (sg) {
            sg.clear();
            this.scene.shipGraphics.delete(hitShip.id);
          }
          const label = this.scene.textLabels.get(hitShip.id);
          if (label) { label.destroy(); this.scene.textLabels.delete(hitShip.id); }
          const warnLabel = this.scene.textLabels.get(`meteor-warning-${hitShip.id}`);
          if (warnLabel) { warnLabel.destroy(); this.scene.textLabels.delete(`meteor-warning-${hitShip.id}`); }
          if (this.scene.spaceships.size === 0) this.scene.lose();
        } else {
          let colMsg = '';
          if (meteor.sizeType === 'LARGE') colMsg = `大型隕石、迎撃失敗。${hitShip.id}に衝突！被害確認中…`;
          else if (meteor.sizeType === 'MEDIUM') colMsg = `中型隕石、迎撃失敗。${hitShip.id}に衝突！被害確認中…`;
          else if (meteor.sizeType === 'SMALL') colMsg = `小型隕石、${hitShip.id}に衝突`;
          if (colMsg) window.__chatWidget?.pushSystemMessage(colMsg);
        }

        meteor.isDestroyed = true;
        toRemove.push(mId);
      }
    }

    for (const mId of toRemove) {
      this.removeMeteor(mId);
    }

    if (this.selectedMeteorId && this.domMeteorModal && !this.domMeteorModal.classList.contains('hidden')) {
      this.updateMeteorModalData();
    }
  }

  /**
   * ユニットから隕石への攻撃処理。
   */
  private handleMeteorCombat(dt: number): void {
    for (const ship of this.scene.spaceships.values()) {
      if (!ship.attackTargetMeteorId) continue;

      const meteor = this.meteors.get(ship.attackTargetMeteorId);
      if (!meteor || meteor.isDestroyed) {
        ship.attackTargetMeteorId = null;
        continue;
      }

      ship.attackCooldown = Math.max(0, ship.attackCooldown - dt);

      const dist = CommunicationSystem.getDistance(ship.x, ship.y, meteor.x, meteor.y);
      if (dist <= ship.ATTACK_RANGE && ship.attackCooldown <= 0) {
        meteor.takeDamage(ship.ATTACK_DAMAGE);
        ship.attackCooldown = ship.ATTACK_COOLDOWN_MS;
        this.scene.showFloatingText(meteor.x, meteor.y, `HIT -${ship.ATTACK_DAMAGE}`, '#fbbf24');

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
  private drawMeteors(time: number): void {
    const shipsWithWarnings = new Set<string>();
    for (const [mId, meteor] of this.meteors.entries()) {
      if (meteor.isDestroyed) continue;

      const sprite = this.meteorSprites.get(mId);
      if (sprite && meteor.isDetected) {
        sprite.setPosition(meteor.x, meteor.y);
        sprite.setRotation(meteor.rotation);

        for (const ship of this.scene.spaceships.values()) {
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

    // 接近警報
    for (const ship of this.scene.spaceships.values()) {
      const warningId = `meteor-warning-${ship.id}`;
      if (shipsWithWarnings.has(ship.id)) {
        const pulse = (Math.sin(time / 200) + 1) / 2;
        const isHQ = ship.id === 'HQ Ship';

        this.meteorGraphics.lineStyle(3, 0xef4444, 0.5 + pulse * 0.5);
        this.meteorGraphics.strokeCircle(ship.x, ship.y, isHQ ? 55 : 40);

        if (!this.scene.textLabels.has(warningId)) {
          const wt = this.scene.add.text(ship.x, ship.y - 55, 'METEOR WARNING', {
            fontSize: '12px', color: '#ef4444', fontStyle: 'bold', fontFamily: 'Rajdhani'
          }).setOrigin(0.5).setDepth(20);
          this.scene.textLabels.set(warningId, wt);
        } else {
          const txt = this.scene.textLabels.get(warningId);
          if (txt) {
            txt.setPosition(ship.x, ship.y - 55).setVisible(true);
          }
        }
      } else {
        const txt = this.scene.textLabels.get(warningId);
        if (txt) txt.setVisible(false);
      }
    }

    // 攻撃レーザーエフェクト
    for (const ship of this.scene.spaceships.values()) {
      if (!ship.attackTargetMeteorId) continue;
      const meteor = this.meteors.get(ship.attackTargetMeteorId);
      if (!meteor || meteor.isDestroyed) continue;

      const dist = CommunicationSystem.getDistance(ship.x, ship.y, meteor.x, meteor.y);
      if (dist <= ship.ATTACK_RANGE) {
        const intensity = ship.attackCooldown > 0 ? (ship.attackCooldown / ship.ATTACK_COOLDOWN_MS) : 0;
        const alpha = 0.3 + intensity * 0.7;
        this.meteorGraphics.lineStyle(2, 0xfbbf24, alpha);
        this.meteorGraphics.lineBetween(ship.x, ship.y, meteor.x, meteor.y);

        if (intensity > 0.5) {
          this.meteorGraphics.fillStyle(0xffffff, intensity);
          this.meteorGraphics.fillCircle(meteor.x, meteor.y, 5);
        }
      } else {
        // 射程外だが追尾中 → 点線
        this.meteorGraphics.lineStyle(1, 0xfbbf24, 0.15);
        this.meteorGraphics.lineBetween(ship.x, ship.y, meteor.x, meteor.y);
      }
    }
  }

  /**
   * 爆発エフェクト（隕石撃破時）。
   */
  private createExplosion(x: number, y: number): void {
    const colors = [0xff6b35, 0xef4444, 0xfbbf24, 0xffffff];
    for (let i = 0; i < colors.length; i++) {
      const g = this.scene.add.graphics().setDepth(20);
      const startRadius = 5 + i * 3;
      const endRadius = 40 + i * 20;
      const delay = i * 50;

      g.fillStyle(colors[i], 0.8);
      g.fillCircle(x, y, startRadius);

      this.scene.tweens.add({
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

    // 破片飛散
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.5;
      const speed = 30 + Math.random() * 40;
      const particle = this.scene.add.graphics().setDepth(20);
      particle.fillStyle(0xfbbf24, 1);
      particle.fillCircle(x, y, 2);

      const endX = x + Math.cos(angle) * speed;
      const endY = y + Math.sin(angle) * speed;

      this.scene.tweens.add({
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
   * 衝突エフェクト（隕石がユニットに到達した時）。
   */
  private createCollisionEffect(x: number, y: number): void {
    const ring = this.scene.add.graphics().setDepth(20);
    this.scene.tweens.add({
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

    const flash = this.scene.add.graphics().setDepth(19);
    flash.fillStyle(0xff6b35, 0.6);
    flash.fillCircle(x, y, 30);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy()
    });

    this.scene.cameras.main.shake(200, 0.005);
  }

  /**
   * 隕石をマップから削除する。
   */
  private removeMeteor(meteorId: string): void {
    this.meteors.delete(meteorId);
    const sprite = this.meteorSprites.get(meteorId);
    if (sprite) {
      sprite.destroy();
      this.meteorSprites.delete(meteorId);
    }
    this.meteorAlerted.delete(meteorId);

    if (this.selectedMeteorId === meteorId) {
      this.selectedMeteorId = null;
      this.domMeteorModal?.classList.add('hidden');
    }

    for (const ship of this.scene.spaceships.values()) {
      if (ship.attackTargetMeteorId === meteorId) {
        ship.attackTargetMeteorId = null;
      }
    }
  }

  /**
   * 隕石モーダルのデータを更新する。
   */
  private updateMeteorModalData(): void {
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
