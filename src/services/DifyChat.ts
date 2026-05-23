// Dify Chat Messages API クライアント（サーバーサイドプロキシ経由）
// APIキーはサーバー側でのみ管理される

export interface DifyChatOptions {
  query: string;
  conversationId: string | null;
  // Dify は入力変数として string / number / boolean を受け付ける
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

  constructor() {
    // セッションごとに一意なユーザーIDを生成（Dify 側で会話を一意に識別するため）
    this.userId = crypto.randomUUID();
  }

  /** APIキーはサーバーサイドで管理されるため、クライアント側では常に有効と見なす */
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

    // 初回送信時は conversation_id を含めない（Dify が新規 ID を発行）
    if (options.conversationId) {
      body.conversation_id = options.conversationId;
    }

    let response: Response;
    try {
      response = await fetch('/api/dify-chat', {
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
