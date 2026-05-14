import { Planet, PLANET_SPECS, COMM_PLANET_SPEC } from '../models/Planet';
import { CommunicationSystem } from '../models/CommunicationSystem';
import type { MainScene } from '../scenes/MainScene';

/**
 * 惑星システム。
 * 配置・移動・通信干渉ゾーン描画・モーダル制御を担当する。
 */
export class PlanetSystem {
  private scene: MainScene;

  private planets: Planet[] = [];
  private planetSprites: Phaser.GameObjects.Image[] = [];

  // 惑星モーダル DOM
  private domPlanetModal: HTMLElement | null = null;
  private domPlanetModalClose: HTMLElement | null = null;
  private domPlanetId: HTMLElement | null = null;
  private domPlanetCommStation: HTMLElement | null = null;
  private domPlanetDesc: HTMLElement | null = null;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  /**
   * DOM 要素取得・close ハンドラ・惑星配置を一括初期化。
   * MainScene.create() から呼ぶ。
   *
   * @param cx, cy マップ中心
   * @param surveyPoint 調査ポイント座標
   * @param unitSpawnCenter ユニット編隊中心（レガシー星間通信用の通信惑星をこの近辺に固定配置）
   */
  init(
    cx: number,
    cy: number,
    surveyPoint: { x: number; y: number },
    unitSpawnCenter: { x: number; y: number }
  ): void {
    this.domPlanetModal = document.getElementById('planet-modal');
    this.domPlanetModalClose = document.getElementById('planet-modal-close');
    this.domPlanetId = document.getElementById('planet-id');
    this.domPlanetCommStation = document.getElementById('planet-comm-station');
    this.domPlanetDesc = document.getElementById('planet-desc');

    if (this.domPlanetModalClose) {
      this.domPlanetModalClose.onclick = () => {
        this.domPlanetModal?.classList.add('hidden');
      };
    }

    this.placePlanets(cx, cy, surveyPoint);
    this.placeCommPlanet(unitSpawnCenter.x, unitSpawnCenter.y);
  }

  /**
   * 1フレーム分の更新（惑星の vx/vy 移動とスプライト追従）。
   */
  update(dt: number): void {
    for (let i = 0; i < this.planets.length; i++) {
      this.planets[i].update(dt);
      const ps = this.planetSprites[i];
      if (ps) {
        ps.setPosition(this.planets[i].x, this.planets[i].y);
      }
    }
  }

  /**
   * 通信干渉ゾーンを Graphics に描画する（vizMode='quality' のとき MainScene から呼ぶ）。
   */
  drawInterferenceZones(g: Phaser.GameObjects.Graphics): void {
    const PINK = 0xfb7185;
    for (const planet of this.planets) {
      // 長距離干渉ゾーン (2500km) - 外側、薄め
      g.fillStyle(PINK, 0.04);
      g.fillCircle(planet.x, planet.y, CommunicationSystem.PLANET_LONG_RANGE_INTERFERENCE);
      // 短距離干渉ゾーン (700km) - 内側、濃いめ
      g.fillStyle(PINK, 0.08);
      g.fillCircle(planet.x, planet.y, CommunicationSystem.PLANET_SHORT_RANGE_INTERFERENCE);
    }
  }

  /**
   * ワールド座標から惑星クリックを処理する。
   * @returns ヒットしたら true（呼び出し元は後続の判定を中断）
   */
  handleClick(worldX: number, worldY: number): boolean {
    const PLANET_HIT_RADIUS = 100;
    for (let i = 0; i < this.planetSprites.length; i++) {
      const s = this.planetSprites[i];
      const dp = CommunicationSystem.getDistance(worldX, worldY, s.x, s.y);
      if (dp < PLANET_HIT_RADIUS) {
        this.openPlanetModalById(this.planets[i].id);
        return true;
      }
    }
    return false;
  }

  /**
   * 惑星情報モーダルを開く（Unit / Meteor モーダルとは排他）。
   */
  openPlanetModalById(planetId: string): void {
    const planet = this.planets.find(p => p.id === planetId);
    if (!planet || !this.domPlanetModal) return;

    this.scene.closeOtherModals('planet');

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

  /**
   * 惑星モーダルを閉じる（他システムからの排他制御用）。
   */
  closeModal(): void {
    this.domPlanetModal?.classList.add('hidden');
  }

  /**
   * 通信品質計算で参照するため、惑星リストを返す。
   */
  getPlanets(): Planet[] {
    return this.planets;
  }

  /**
   * レガシー星間通信用の中継惑星（PLN_COMM）を返す。存在しない場合は null。
   */
  getCommPlanet(): Planet | null {
    return this.planets.find(p => p.id === COMM_PLANET_SPEC.id) ?? null;
  }

  /**
   * 通常惑星（PLN_COMM 以外）を返す。通信品質計算で干渉源として参照する。
   */
  getRegularPlanets(): Planet[] {
    return this.planets.filter(p => p.id !== COMM_PLANET_SPEC.id);
  }

  /**
   * 惑星をランダム配置：他の重要地点から一定以上離す制約付き。
   */
  private placePlanets(cx: number, cy: number, surveyPoint: { x: number; y: number }): void {
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

        const distFromSurvey = CommunicationSystem.getDistance(x, y, surveyPoint.x, surveyPoint.y);
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
      // 隕石速度(30)の1/5でランダムな一定方向に移動
      const PLANET_SPEED = 30 / 5;
      const angle = Math.random() * Math.PI * 2;
      planet.vx = Math.cos(angle) * PLANET_SPEED;
      planet.vy = Math.sin(angle) * PLANET_SPEED;
      this.planets.push(planet);

      // Phaser スプライトとして配置（クリック検出用に planetId を保存）
      const sprite = this.scene.add.image(candidate.x, candidate.y, 'planet');
      sprite.setScale(0.5);
      sprite.setDepth(2);
      sprite.setData('planetId', spec.id);
      this.planetSprites.push(sprite);
    }
  }

  /**
   * レガシー星間通信用の中継惑星をユニット編隊上方に固定配置する。
   * - 移動しない（vx=vy=0）
   * - ユニット編隊と重ならない距離を確保
   * - 通常惑星の干渉ゾーンと近接しすぎない位置を探索
   */
  private placeCommPlanet(unitSpawnX: number, unitSpawnY: number): void {
    const PREFERRED_OFFSET = 1000;       // 編隊からの優先距離
    const MIN_DIST_FROM_UNIT = 600;      // ユニットとの最低距離
    const MIN_DIST_FROM_OTHER = 800;     // 他惑星との最低距離
    const MAX_RETRIES = 12;

    // 候補位置: 編隊上方を起点に、ぶつかる場合は周回方向にずらす
    let candidate: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const angle = -Math.PI / 2 + (attempt * Math.PI / 6); // 上方向から時計回り
      const x = unitSpawnX + Math.cos(angle) * PREFERRED_OFFSET;
      const y = unitSpawnY + Math.sin(angle) * PREFERRED_OFFSET;

      // ユニットスポーン中心から最低距離を確保
      if (CommunicationSystem.getDistance(x, y, unitSpawnX, unitSpawnY) < MIN_DIST_FROM_UNIT) continue;

      // 他惑星と重ならないか
      let tooClose = false;
      for (const p of this.planets) {
        if (CommunicationSystem.getDistance(x, y, p.x, p.y) < MIN_DIST_FROM_OTHER) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      candidate = { x, y };
      break;
    }
    if (!candidate) {
      // フェイルオープン：編隊上方に強制配置
      candidate = { x: unitSpawnX, y: unitSpawnY - PREFERRED_OFFSET };
    }

    const planet = new Planet(
      COMM_PLANET_SPEC.id,
      candidate.x,
      candidate.y,
      COMM_PLANET_SPEC.hasCommStation,
      COMM_PLANET_SPEC.description ?? ''
    );
    // 中継基地として固定配置
    planet.vx = 0;
    planet.vy = 0;
    this.planets.push(planet);

    const sprite = this.scene.add.image(candidate.x, candidate.y, 'planet_comm');
    // 元画像 1024x1024 を通常惑星(150x150 * 0.5 = 75px相当)に近づける
    sprite.setScale(0.15);
    sprite.setDepth(2);
    sprite.setData('planetId', COMM_PLANET_SPEC.id);
    this.planetSprites.push(sprite);
  }
}
