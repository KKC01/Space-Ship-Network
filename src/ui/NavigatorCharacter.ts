// キャラクター画像を動的に切り替えるナビゲーターコンポーネント。
// import.meta.glob でアセットを一括バンドルし、ファイル名→URL マップから引く。
const AI_02_IMAGES = import.meta.glob('../assets/character/AI_02/*.png', { eager: true, as: 'url' }) as Record<string, string>;

// "operator_AI_02.png" のようなファイル名から URL を返す
function resolveCharacterUrl(filename: string): string | null {
  for (const [path, url] of Object.entries(AI_02_IMAGES)) {
    if (path.endsWith('/' + filename)) return url;
  }
  // AI_01 フォルダもフォールバックとして検索
  return null;
}

export class NavigatorCharacter {
  private container: HTMLElement | null = null;
  private img: HTMLImageElement | null = null;
  private linesEl: HTMLElement | null = null;

  mount(parent: HTMLElement, imageFilename: string, opName?: string, opId?: string): void {
    this.container = document.createElement('div');
    this.container.className = 'navigator-stack';
    this.container.setAttribute('data-testid', 'navigator-stack');

    this.img = document.createElement('img');
    this.img.alt = opName ?? 'Navigator';
    this.img.style.animation = 'navigator-sway 4s ease-in-out infinite';
    this.setImage(imageFilename);

    // 下端オーバーレイ（id/status 表示）
    const overlay = document.createElement('div');
    overlay.className = 'navigator-overlay';

    const nameEl = document.createElement('span');
    nameEl.className = 'navigator-overlay__name';
    nameEl.textContent = opName ?? 'AI OPERATOR';

    const idEl = document.createElement('span');
    idEl.className = 'navigator-overlay__id';
    idEl.textContent = opId ?? 'ID: --';

    overlay.appendChild(nameEl);
    overlay.appendChild(idEl);

    this.linesEl = document.createElement('div');
    this.linesEl.className = 'navigator-lines';
    this.linesEl.setAttribute('data-testid', 'nav-line');

    this.container.appendChild(this.img);
    this.container.appendChild(overlay);
    this.container.appendChild(this.linesEl);
    parent.appendChild(this.container);
  }

  setImage(imageFilename: string): void {
    if (!this.img) return;
    const url = resolveCharacterUrl(imageFilename);
    if (url) {
      this.img.src = url;
    } else {
      // フォールバック: 空文字（壊れた画像を表示しない）
      this.img.src = '';
    }
  }

  // 最初の台詞のみ表示（複数台詞は将来の config 用）
  setLines(lines: string[]): void {
    if (!this.linesEl) return;
    this.linesEl.textContent = lines[0] ?? '';
  }
}
