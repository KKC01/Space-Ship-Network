import operatorImg from '../assets/character/AI_02/operator_AI_01.png';
import operatorMiniImg from '../assets/character/AI_02/operator_AI_00_0.png';
import { DifyChat, DifyApiError, DifyNetworkError, DifyConfigError } from '../services/DifyChat';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface ChatWidgetState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  conversationId: string | null;
}

export class ChatWidget {
  public disabled: boolean = false;

  private state: ChatWidgetState = {
    isOpen: false,
    messages: [],
    isLoading: false,
    conversationId: null,
  };

  private difyChat: DifyChat | null = null;
  private configError: string | null = null;

  private container: HTMLElement;
  private panel!: HTMLElement;
  private messageList!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private portrait!: HTMLImageElement;
  private toggleBtn!: HTMLButtonElement;
  private wikiCheckbox!: HTMLInputElement;

  constructor(mountTarget: HTMLElement) {
    this.container = mountTarget;

    // Dify クライアントを初期化（APIキー未設定の場合は configError に格納し、UIで表示）
    try {
      this.difyChat = new DifyChat();
    } catch (e) {
      if (e instanceof DifyConfigError) {
        this.configError = e.message;
      } else {
        this.configError = 'チャットサービスの初期化に失敗しました';
      }
    }

    this.render();
    this.bindEvents();

    // MainScene からアクセス可能にする
    window.__chatWidget = this;
  }

  private render(): void {
    this.container.innerHTML = `
      <button id="chat-toggle-btn" aria-label="チャットを開く">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>CHAT</span>
      </button>

      <div id="chat-panel" class="glass-panel" role="dialog" aria-label="オペレーターチャット">
        <div class="chat-operator-area">
          <img class="operator-portrait" src="${operatorImg}" alt="Operator AI" />
          <div class="operator-info">
            <div class="operator-name">Operator AI</div>
            <div class="operator-status" id="operator-status"></div>
          </div>
          <div class="operator-speech-indicator" id="speech-indicator">
            <span></span><span></span><span></span>
          </div>
          <button class="chat-close-btn" aria-label="閉じる">&times;</button>
        </div>

        <div class="chat-messages" id="chat-messages"></div>

        <div class="chat-options-area">
          <label class="chat-option-checkbox">
            <input type="checkbox" id="chat-wiki-checkbox" />
            <span>地球 問合せ</span>
          </label>
        </div>

        <div class="chat-input-area">
          <textarea
            id="chat-input"
            placeholder="メッセージを入力... (Enter で送信)"
            rows="1"
            aria-label="メッセージ入力"
          ></textarea>
          <button id="chat-send-btn" class="chat-send-btn" aria-label="送信">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.panel = this.container.querySelector('#chat-panel') as HTMLElement;
    this.messageList = this.container.querySelector('#chat-messages') as HTMLElement;
    this.input = this.container.querySelector('#chat-input') as HTMLTextAreaElement;
    this.sendBtn = this.container.querySelector('#chat-send-btn') as HTMLButtonElement;
    this.portrait = this.container.querySelector('.operator-portrait') as HTMLImageElement;
    this.toggleBtn = this.container.querySelector('#chat-toggle-btn') as HTMLButtonElement;
    this.wikiCheckbox = this.container.querySelector('#chat-wiki-checkbox') as HTMLInputElement;

    const portraitMini = document.getElementById('operator-portrait-mini') as HTMLImageElement | null;
    if (portraitMini) portraitMini.src = operatorMiniImg;
  }

  private bindEvents(): void {
    this.toggleBtn.addEventListener('click', () => this.toggle());

    const closeBtn = this.container.querySelector('.chat-close-btn') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.close());

    // 下フリックで閉じる（ヘッダー部分をドラッグ）
    const header = this.container.querySelector('.chat-operator-area') as HTMLElement;
    let startY = 0;
    let isDragging = false;

    const onStart = (y: number) => { startY = y; isDragging = true; };
    const onEnd = (y: number) => {
      if (isDragging && y - startY > 80) this.close();
      isDragging = false;
    };

    header.addEventListener('touchstart', (e) => onStart(e.touches[0].clientY), { passive: true });
    header.addEventListener('touchend',   (e) => onEnd(e.changedTouches[0].clientY), { passive: true });
    header.addEventListener('mousedown',  (e) => onStart(e.clientY));
    header.addEventListener('mouseup',    (e) => onEnd(e.clientY));

    this.sendBtn.addEventListener('click', () => this.sendMessage());

    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // textarea の高さを内容に合わせて自動調整
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 100) + 'px';
    });
  }

  toggle(): void {
    if (this.state.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.state.isOpen = true;
    this.panel.classList.add('open');
    this.toggleBtn.classList.add('active');
    setTimeout(() => this.input.focus(), 300);
  }

  private close(): void {
    this.state.isOpen = false;
    this.panel.classList.remove('open');
    this.toggleBtn.classList.remove('active');
  }

  private async sendMessage(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.state.isLoading) return;

    // 設定エラーがある場合はエラーバブルを表示して中断
    if (!this.difyChat) {
      this.input.value = '';
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
      this.state.messages.push(userMsg);
      this.appendMessageBubble(userMsg);
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'error',
        content: this.configError ?? 'チャットサービスを利用できません',
      };
      this.state.messages.push(errMsg);
      this.appendMessageBubble(errMsg);
      return;
    }

    this.input.value = '';
    this.input.style.height = 'auto';

    // ユーザーメッセージをUIに追加
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    this.state.messages.push(userMsg);
    this.appendMessageBubble(userMsg);

    // ローディング状態に遷移
    this.setLoading(true);

    try {
      // ゲーム状態を inputs として収集（window.__gameState は MainScene が更新）
      const inputs = this.collectGameStateInputs();

      const result = await this.difyChat.sendMessage({
        query: text,
        conversationId: this.state.conversationId,
        inputs,
      });

      // 会話 ID を保存（次回以降の履歴維持に使用）
      this.state.conversationId = result.conversationId;

      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: result.answer };
      this.state.messages.push(aiMsg);
      this.appendMessageBubble(aiMsg);
    } catch (e) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'error',
        content: this.formatErrorMessage(e),
      };
      this.state.messages.push(errMsg);
      this.appendMessageBubble(errMsg);
    } finally {
      this.setLoading(false);
      this.scrollToBottom();
    }
  }

  /** window.__gameState から Dify に送る inputs を構築（wiki のみ boolean、その他は string） */
  private collectGameStateInputs(): Record<string, string | boolean> {
    // 「地球 問合せ」チェック時は wiki=true で Dify に送信（Dify 側 IF/ELSE の True 分岐とマッチ）
    const wikiFlag = this.wikiCheckbox?.checked === true;
    const s = window.__gameState;
    if (!s) return { wiki: wikiFlag };
    return {
      ship_count: String(s.shipCount),
      selected_unit: s.selectedUnitId ?? '',
      selected_unit_hp: s.selectedUnitHp !== null ? String(s.selectedUnitHp) : '',
      mission_reach: String(s.missionReach),
      mission_all_linked: String(s.missionAllLinked),
      mission_data: String(s.missionData),
      elapsed_seconds: String(s.elapsedSeconds),
      game_mode: s.gameMode,
      game_status: s.gameStatus,
      wiki: wikiFlag,
    };
  }

  /** 例外をユーザー表示用の汎用メッセージに変換（APIキー等の情報が漏れないように整形） */
  private formatErrorMessage(e: unknown): string {
    if (e instanceof DifyNetworkError) {
      return 'ネットワーク接続に失敗しました。回線を確認してください。';
    }
    if (e instanceof DifyApiError) {
      if (e.statusCode === 401) return '認証に失敗しました。APIキー設定を確認してください。';
      if (e.statusCode === 429) return 'リクエスト数が上限に達しました。しばらく待って再試行してください。';
      if (e.statusCode >= 500) return 'サーバー側でエラーが発生しました。再度お試しください。';
      // 4xx 系は Dify が返したメッセージ詳細を併記（e.message には Dify の message フィールドが入っている）
      const detail = e.message && !e.message.startsWith('API エラー') ? `: ${e.message}` : '';
      return `通信エラーが発生しました (status ${e.statusCode})${detail}`;
    }
    return '予期しないエラーが発生しました。';
  }

  private setLoading(loading: boolean): void {
    this.state.isLoading = loading;
    this.sendBtn.disabled = loading;
    this.input.disabled = loading;

    const statusEl = this.container.querySelector('#operator-status') as HTMLElement;
    const speechEl = this.container.querySelector('#speech-indicator') as HTMLElement;

    if (loading) {
      this.portrait.classList.add('speaking');
      statusEl.textContent = 'TRANSMITTING';
      statusEl.style.color = '#38bdf8';
      speechEl.classList.add('active');
    } else {
      this.portrait.classList.remove('speaking');
      statusEl.textContent = '';
      statusEl.style.color = '';
      speechEl.classList.remove('active');
    }
  }

  private appendMessageBubble(msg: ChatMessage): void {
    const el = document.createElement('div');
    el.className = `chat-bubble chat-bubble-${msg.role}`;
    el.dataset.id = msg.id;
    el.textContent = msg.content;
    this.messageList.appendChild(el);
    this.scrollToBottom();
  }

  private pushToMissionLog(text: string): void {
    const log = document.getElementById('mission-log');
    if (!log) return;
    log.querySelectorAll('.mission-log-line.new').forEach(el => el.classList.remove('new'));
    const line = document.createElement('div');
    line.className = 'mission-log-line new';
    line.textContent = text;
    log.appendChild(line);
    while (log.children.length > 4) {
      log.removeChild(log.firstChild!);
    }
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    });
  }

  /**
   * システムメッセージをミッションログにのみ流す（チャットには表示しない）。
   * MainScene などの外部モジュールから呼び出し可能。
   */
  public pushSystemMessage(content: string): void {
    if (this.disabled) return;
    this.pushToMissionLog(content);
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
