import { MISSION_CATALOG, type MissionId, type FormationEntry } from '../systems/MissionCatalog';
import { UNIT_CATALOG, getAllUnitsOrdered, type UnitSpec } from '../systems/UnitCatalog';
import type { UnitType } from '../models/Spaceship';
import type { MainScene } from '../scenes/MainScene';
import type { TitleScreen } from './TitleScreen';

// UnitType → 短縮プレフィックスのマップ（採番用）
const TYPE_PREFIX: Partial<Record<UnitType, string>> = {
  'Frigate':          'Frig',
  'Legacy Frigate':   'L-Frig',
  'Repair Ship':      'Rep',
  'Destroyer':        'Dest',
  'Legacy Destroyer': 'L-Dest',
  'Cruiser':          'Crus',
  'Light Carrier':    'L-Car',
  'Carrier':          'Car',
};

// 艦種アセット。存在しないファイルは Frigate でフォールバック
const ASSET_MODULES = import.meta.glob('../assets/Space_Ship/*.png', { eager: true, as: 'url' }) as Record<string, string>;

function resolveShipUrl(imageKey: string): string {
  for (const [path, url] of Object.entries(ASSET_MODULES)) {
    if (path.endsWith('/' + imageKey)) return url;
  }
  // フォールバック
  for (const [path, url] of Object.entries(ASSET_MODULES)) {
    if (path.endsWith('/Frigate.png')) return url;
  }
  return '';
}

export class CustomizeShipScreen {
  private scene: MainScene;
  private missionId: MissionId;
  private titleScreen: TitleScreen;
  private overlay: HTMLElement | null = null;
  private formation: FormationEntry[];
  private budgetBarFill: HTMLElement | null = null;
  private budgetRemainingEl: HTMLElement | null = null;
  private formationListEl: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private warningEl: HTMLElement | null = null;

  constructor(scene: MainScene, missionId: MissionId, titleScreen: TitleScreen) {
    this.scene = scene;
    this.missionId = missionId;
    this.titleScreen = titleScreen;
    // 推奨編成のディープコピーを初期状態として使う
    this.formation = MISSION_CATALOG[missionId].recommendedFormation.map((f) => ({ ...f }));
  }

  show(): void {
    this.overlay = document.getElementById('customize-overlay');
    if (!this.overlay) return;
    this.build();
    this.overlay.style.display = '';
    this.overlay.classList.add('open');
  }

  hide(): void {
    if (this.overlay) {
      this.overlay.classList.remove('open');
      this.overlay.style.display = 'none';
    }
  }

  destroy(): void {
    if (this.overlay) {
      this.overlay.innerHTML = '';
      this.overlay.classList.remove('open');
      this.overlay.style.display = 'none';
    }
  }

  private build(): void {
    const el = this.overlay!;
    el.innerHTML = '';

    // ====== ヘッダー（戻るボタン） ======
    const header = document.createElement('div');
    header.className = 'customize-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'customize-back-btn';
    backBtn.setAttribute('data-testid', 'back-btn');
    backBtn.textContent = '← BACK';
    backBtn.addEventListener('click', () => {
      this.hide();
      this.titleScreen.show();
    });
    header.appendChild(backBtn);
    el.appendChild(header);

    // ====== トップバー: BUDGET / FORMATION（旧右カラムから上部に移動） ======
    const topbar = document.createElement('div');
    topbar.className = 'customize-topbar';

    // 予算バー
    const budgetSection = document.createElement('div');
    budgetSection.className = 'customize-budget-section';

    const budgetLabel = document.createElement('div');
    budgetLabel.className = 'customize-budget-label';
    budgetLabel.textContent = '予算';

    this.budgetRemainingEl = document.createElement('div');
    this.budgetRemainingEl.className = 'customize-budget-remaining';
    this.budgetRemainingEl.setAttribute('data-testid', 'budget-remaining');

    const budgetBarWrap = document.createElement('div');
    budgetBarWrap.className = 'budget-bar';
    budgetBarWrap.setAttribute('data-testid', 'budget-bar');

    this.budgetBarFill = document.createElement('div');
    this.budgetBarFill.className = 'budget-bar__fill';
    budgetBarWrap.appendChild(this.budgetBarFill);

    budgetSection.appendChild(budgetLabel);
    budgetSection.appendChild(this.budgetRemainingEl);
    budgetSection.appendChild(budgetBarWrap);
    topbar.appendChild(budgetSection);

    // 編成リスト
    const formationSection = document.createElement('div');
    formationSection.className = 'customize-formation-section';

    const formLabel = document.createElement('div');
    formLabel.className = 'formation-label';
    formLabel.textContent = 'FORMATION';
    formationSection.appendChild(formLabel);

    this.formationListEl = document.createElement('ul');
    this.formationListEl.className = 'formation-list';
    formationSection.appendChild(this.formationListEl);

    // 警告テキスト
    this.warningEl = document.createElement('div');
    this.warningEl.className = 'customize-warning';
    this.warningEl.style.display = 'none';
    formationSection.appendChild(this.warningEl);

    topbar.appendChild(formationSection);

    el.appendChild(topbar);

    // ====== メイン（ユニットカード一覧） ======
    const main = document.createElement('div');
    main.className = 'customize-main';

    const unitGrid = document.createElement('div');
    unitGrid.className = 'unit-size-grid';
    for (const spec of getAllUnitsOrdered()) {
      unitGrid.appendChild(this.buildUnitCard(spec));
    }
    main.appendChild(unitGrid);

    el.appendChild(main);

    // 出撃ボタン（右下固定）
    this.confirmBtn = document.createElement('button');
    this.confirmBtn.className = 'deploy-btn customize-deploy-btn';
    this.confirmBtn.setAttribute('data-testid', 'confirm-deploy-btn');
    this.confirmBtn.textContent = 'DEPLOY';
    this.confirmBtn.addEventListener('click', () => {
      this.hide();
      this.titleScreen.hide();
      this.scene.startMission(this.missionId, this.formation);
    });
    el.appendChild(this.confirmBtn);

    this.refreshFormation();
  }

  private buildUnitCard(spec: UnitSpec): HTMLElement {
    const card = document.createElement('div');
    card.className = 'unit-card';
    card.setAttribute('data-testid', `unit-card-${spec.unitType}`);

    const img = document.createElement('img');
    img.src = resolveShipUrl(spec.imageKey);
    img.alt = spec.unitType;
    card.appendChild(img);

    const name = document.createElement('div');
    name.className = 'unit-card__name';
    // ユニット名（左）+ COST（右）を同じ行に
    name.innerHTML =
      `<span>${spec.unitType}</span>` +
      `<span class="unit-card__cost">COST:${spec.cost}</span>`;
    card.appendChild(name);

    const stats = document.createElement('div');
    stats.className = 'unit-card__stats';
    stats.innerHTML =
      `<span class="unit-card__stat-label">攻撃</span><span class="unit-card__stat-value">${spec.attack}</span>` +
      `<span class="unit-card__stat-label">通信</span><span class="unit-card__stat-value">${spec.comms}</span>` +
      `<span class="unit-card__stat-label">HP</span><span class="unit-card__stat-value">${spec.hp}</span>`;
    card.appendChild(stats);

    const addBtn = document.createElement('button');
    addBtn.className = 'unit-card__add-btn';
    addBtn.setAttribute('data-testid', `add-unit-${spec.unitType}`);
    addBtn.textContent = 'ADD';
    addBtn.addEventListener('click', () => this.addUnit(spec.unitType));
    card.appendChild(addBtn);

    return card;
  }

  private addUnit(type: UnitType): void {
    const prefix = TYPE_PREFIX[type] ?? type.substring(0, 4);

    // 同じプレフィックスの最大番号を探して +1
    let maxNum = 0;
    for (const f of this.formation) {
      if (f.id.startsWith(prefix)) {
        const num = parseInt(f.id.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }

    // 横方向にランダムオフセット。Y は最後のユニットより下に配置
    const lastDy = this.formation.length > 0
      ? Math.max(...this.formation.map((f) => f.dy))
      : 0;

    this.formation.push({
      id: `${prefix}${maxNum + 1}`,
      type,
      dx: (Math.random() - 0.5) * 400,
      dy: lastDy + 200,
    });
    this.refreshFormation();
  }

  private removeUnit(id: string): void {
    const entry = this.formation.find((f) => f.id === id);
    if (!entry) return;

    // Legacy Destroyer が 0 になるなら削除不可
    const legacyCount = this.formation.filter((f) => f.type === 'Legacy Destroyer').length;
    if (entry.type === 'Legacy Destroyer' && legacyCount <= 1) {
      if (this.warningEl) {
        this.warningEl.textContent = '指揮艦 (Legacy Destroyer) は最低 1 隻必要です';
        this.warningEl.style.display = 'block';
        setTimeout(() => { if (this.warningEl) this.warningEl.style.display = 'none'; }, 2500);
      }
      return;
    }

    this.formation = this.formation.filter((f) => f.id !== id);
    this.refreshFormation();
  }

  private calcCost(): number {
    return this.formation.reduce((sum, f) => sum + (UNIT_CATALOG[f.type]?.cost ?? 0), 0);
  }

  private refreshFormation(): void {
    const def = MISSION_CATALOG[this.missionId];
    const cost = this.calcCost();
    const remaining = def.budget - cost;
    const ratio = Math.min(1, cost / def.budget);
    const isOver = cost > def.budget;

    // 予算バー更新
    if (this.budgetBarFill) {
      this.budgetBarFill.style.width = `${ratio * 100}%`;
      const bar = this.budgetBarFill.parentElement;
      if (bar) bar.classList.toggle('budget-bar--over', isOver);
    }

    if (this.budgetRemainingEl) {
      // 表示形式: 「260 / 300：残40」 / 超過時: 「310 / 300：超過10」
      this.budgetRemainingEl.textContent = isOver
        ? `${cost} / ${def.budget}：超過${-remaining}`
        : `${cost} / ${def.budget}：残${remaining}`;
      this.budgetRemainingEl.style.color = isOver ? '#f87171' : '#4ade80';
    }

    // 出撃ボタン
    if (this.confirmBtn) {
      this.confirmBtn.disabled = isOver;
    }

    // 編成リスト再描画
    if (this.formationListEl) {
      this.formationListEl.innerHTML = '';
      for (const f of this.formation) {
        const item = document.createElement('li');
        item.className = 'formation-item';

        const info = document.createElement('span');
        info.className = 'formation-item__info';
        info.textContent = `${f.id} (${f.type}) — ${UNIT_CATALOG[f.type]?.cost ?? '?'}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'formation-item__remove';
        removeBtn.setAttribute('data-testid', `remove-unit-${f.id}`);
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => this.removeUnit(f.id));

        item.appendChild(info);
        item.appendChild(removeBtn);
        this.formationListEl.appendChild(item);
      }
    }
  }
}
