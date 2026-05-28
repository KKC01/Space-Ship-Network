import { MISSION_CATALOG, MISSION_ORDER, type MissionId } from '../systems/MissionCatalog';
import type { MainScene } from '../scenes/MainScene';
import { NavigatorCharacter } from './NavigatorCharacter';

export class TitleScreen {
  private scene: MainScene;
  private overlay: HTMLElement | null = null;
  private selectedMissionId: MissionId = MISSION_ORDER[0];
  private navigator: NavigatorCharacter | null = null;
  // CustomizeShipScreen は動的 import で循環参照を回避
  private mainRightEl: HTMLElement | null = null;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  init(): void {
    this.overlay = document.getElementById('title-overlay');
    if (!this.overlay) return;
    this.build();
    this.show();
  }

  private build(): void {
    const el = this.overlay!;
    el.innerHTML = '';

    // ====== サイドバー ======
    const sidebar = document.createElement('div');
    sidebar.className = 'title-sidebar';

    const logo = document.createElement('div');
    logo.className = 'title-logo';
    logo.innerHTML = `
      <div class="title-logo__main">SPACE-SHIP-NETWORK</div>
    `;
    sidebar.appendChild(logo);

    const missionList = document.createElement('ul');
    missionList.className = 'mission-list';
    missionList.setAttribute('role', 'listbox');

    for (const id of MISSION_ORDER) {
      const def = MISSION_CATALOG[id];
      const item = document.createElement('li');
      item.className = 'mission-item' + (id === this.selectedMissionId ? ' active' : '');
      if (!def.available) item.classList.add('disabled');
      item.setAttribute('data-testid', `mission-item-${id}`);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(id === this.selectedMissionId));
      item.textContent = def.title;
      item.addEventListener('click', () => {
        if (!def.available) return;
        this.selectMission(id);
      });
      missionList.appendChild(item);
    }

    sidebar.appendChild(missionList);

    el.appendChild(sidebar);

    // ====== メイン右エリア ======
    this.mainRightEl = document.createElement('div');
    this.mainRightEl.className = 'title-main';
    el.appendChild(this.mainRightEl);

    this.renderMissionDetail();
  }

  private selectMission(id: MissionId): void {
    this.selectedMissionId = id;

    // active クラスを更新
    const items = this.overlay?.querySelectorAll('.mission-item');
    items?.forEach((item) => {
      const testId = item.getAttribute('data-testid');
      const isActive = testId === `mission-item-${id}`;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });

    this.renderMissionDetail();
  }

  private renderMissionDetail(): void {
    if (!this.mainRightEl) return;
    const def = MISSION_CATALOG[this.selectedMissionId];
    this.mainRightEl.innerHTML = '';

    // タイトル + BUDGET を横並びに
    const head = document.createElement('div');
    head.className = 'title-mission-head';

    const titleEl = document.createElement('h2');
    titleEl.className = 'title-mission-title';
    titleEl.setAttribute('data-testid', 'mission-title');
    titleEl.textContent = def.title;

    const budgetPill = document.createElement('span');
    budgetPill.className = 'title-pill title-pill--accent';
    budgetPill.setAttribute('data-testid', 'mission-budget');
    budgetPill.textContent = `BUDGET: ${def.budget}`;

    head.appendChild(titleEl);
    head.appendChild(budgetPill);
    this.mainRightEl.appendChild(head);

    // ボディ: ナビキャラ + ブリーフィング
    const body = document.createElement('div');
    body.className = 'title-body';

    // ナビキャラ
    const navWrapper = document.createElement('div');
    this.navigator = new NavigatorCharacter();
    this.navigator.mount(navWrapper, def.navigatorImage, 'AI OPERATOR', def.id.toUpperCase());
    this.navigator.setLines(def.navigatorLines);
    body.appendChild(navWrapper);

    // ブリーフィングテキスト
    const briefing = document.createElement('div');
    briefing.className = 'briefing-body';

    if (def.description) {
      const desc = document.createElement('p');
      desc.textContent = def.description;
      briefing.appendChild(desc);
    }

    const briefText = document.createElement('p');
    briefText.style.marginTop = '12px';
    briefText.textContent = def.briefingText;
    briefing.appendChild(briefText);

    // ナビ台詞リスト
    const navLines = document.createElement('ul');
    navLines.className = 'briefing-nav-lines';
    for (const line of def.navigatorLines) {
      const li = document.createElement('li');
      li.textContent = line;
      navLines.appendChild(li);
    }
    briefing.appendChild(navLines);

    body.appendChild(briefing);
    this.mainRightEl.appendChild(body);

    // Deploy ボタン
    const deployBtn = document.createElement('button');
    deployBtn.className = 'deploy-btn';
    deployBtn.setAttribute('data-testid', 'deploy-btn');
    deployBtn.textContent = 'DEPLOY';
    deployBtn.addEventListener('click', () => {
      // 動的 import で循環参照を回避。show() 後に hide() してゲーム画面が一瞬見えるのを防ぐ
      import('./CustomizeShipScreen').then(({ CustomizeShipScreen }) => {
        new CustomizeShipScreen(this.scene, this.selectedMissionId, this).show();
        this.hide();
      });
    });
    this.mainRightEl.appendChild(deployBtn);
  }

  show(): void {
    if (this.overlay) {
      this.overlay.style.display = '';
      this.overlay.classList.add('open');
    }
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
}
