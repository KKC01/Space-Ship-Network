// Dify Chat Messages API クライアント（クラウド版）
// セキュリティ: APIキーはログ・エラーメッセージ・例外に絶対に含めない

const DIFY_BASE_URL = 'https://api.dify.ai/v1';

export interface DifyChatOptions {
  query: string;
  conversationId: string | null;
  inputs?: Record<string, string>;
}

export interface DifyChatResult {
  answer: string;
  conversationId: string;
}

export class DifyNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DifyNetworkError';
  }
}

export class DifyApiError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'DifyApiError';
    this.statusCode = statusCode;
  }
}

export class DifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DifyConfigError';
  }
}

export class DifyChat {
  private readonly apiKey: string;
  private readonly userId: string;

  constructor() {
    // import.meta.env 経由でのみ取得。値そのものはどこにもログ出力しない
    const key = import.meta.env.VITE_DIFY_API_KEY;
    if (!key || typeof key !== 'string' || key.length === 0) {
      throw new DifyConfigError('Dify API キーが設定されていません');
    }
    this.apiKey = key;
    // セッションごとに一意なユーザーIDを生成（Dify 側で会話を一意に識別するため）
    this.userId = crypto.randomUUID();
  }

  /** APIキーが設定されているか確認（値は返さない） */
  static isConfigured(): boolean {
    const key = import.meta.env.VITE_DIFY_API_KEY;
    return typeof key === 'string' && key.length > 0;
  }

  async sendMessage(options: DifyChatOptions): Promise<DifyChatResult> {
    const body: Record<string, unknown> = {
      query: options.query,
      inputs: options.inputs ?? {},
      response_mode: 'blocking',
      user: this.userId,
    };

    // 初回送信時は conversation_id を含めない（Dify が新規 ID を発行）
    if (options.conversationId) {
      body.conversation_id = options.conversationId;
    }

    let response: Response;
    try {
      response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
        method: 'POST',
        headers: {
          // APIキーは Authorization ヘッダー経由でのみ送信。コンソール出力しない
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      // ネットワーク層エラー。元の例外をそのまま伝播させない（万一URLにキーが乗っていた場合の漏洩防止）
      throw new DifyNetworkError('ネットワーク接続に失敗しました');
    }

    if (!response.ok) {
      // ステータスコードのみログ。レスポンスボディ全体は出さない（Difyのエラーレスポンスにキーが含まれる可能性は低いが念のため）
      const status = response.status;
      let detail = '';
      try {
        const data = await response.json();
        // Dify のエラーレスポンス形式: { code, message, status }
        if (data && typeof data.message === 'string') {
          detail = data.message;
        }
      } catch {
        // ボディがJSONでない場合は無視
      }
      throw new DifyApiError(status, detail || `API エラー (status ${status})`);
    }

    const data = await response.json();
    if (typeof data.answer !== 'string' || typeof data.conversation_id !== 'string') {
      throw new DifyApiError(response.status, 'API レスポンス形式が想定外です');
    }

    return {
      answer: data.answer,
      conversationId: data.conversation_id,
    };
  }
}
