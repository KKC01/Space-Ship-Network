export interface DifyChatOptions {
  query: string;
  conversationId: string | null;
  inputs?: Record<string, string | number | boolean>;
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
  private readonly userId: string;
  private readonly endpoint: string;

  constructor() {
    // セッションごとに一意のユーザーIDを使う
    this.userId = crypto.randomUUID();
    this.endpoint = import.meta.env.PROD
      ? 'https://space-ship-dify.space-ship-dify.workers.dev'
      : '/api/dify-chat';
  }

  static isConfigured(): boolean {
    return true;
  }

  async sendMessage(options: DifyChatOptions): Promise<DifyChatResult> {
    const body: Record<string, unknown> = {
      query: options.query,
      inputs: options.inputs ?? {},
      response_mode: 'blocking',
      user: this.userId,
    };

    if (options.conversationId) {
      body.conversation_id = options.conversationId;
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new DifyNetworkError('ネットワーク接続に失敗しました');
    }

    if (!response.ok) {
      const status = response.status;
      let detail = '';
      try {
        const data = await response.json();
        if (data && typeof data.message === 'string') {
          detail = data.message;
        }
      } catch {
        // JSON でない応答は詳細なしで扱う
      }
      throw new DifyApiError(status, detail || `API エラー (status ${status})`);
    }

    const data = await response.json();
    if (typeof data.answer !== 'string' || typeof data.conversation_id !== 'string') {
      throw new DifyApiError(response.status, 'API レスポンス形式が不正です');
    }

    return {
      answer: data.answer,
      conversationId: data.conversation_id,
    };
  }
}
