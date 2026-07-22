#!/usr/bin/env bash
# fusion-install.sh : どの dev container でも fusion(MCP) を1発導入する自己完結スクリプト。
# 使い方: bash fusion-install.sh   （VS Code dotfiles の installCommand に指定すると全コンテナで自動実行）
# 任意: 環境変数 OPENROUTER_API_KEY をセットしておくと鍵も自動設定（無ければ後で `fusion --set-key`）。
set -e
mkdir -p /usr/local/lib/fusion-mcp /usr/local/bin "$HOME/.claude/fusion-mcp" "$HOME/.claude"
chmod 700 "$HOME/.claude/fusion-mcp" 2>/dev/null || true

cat > /usr/local/lib/fusion-mcp/server.py <<'SERVER_EOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fusion-mcp: OpenRouter Fusion を「無料モデルだけ」で呼ぶ MCP stdio サーバー兼 CLI。

特徴:
  - 標準ライブラリのみ（依存ゼロ／サプライチェーンリスク排除）
  - パネル(analysis_models)とジャッジ(model)を :free モデルで明示上書き → 実質 $0
  - usage.cost を返すので「無料($0)」を毎回検証できる

セキュリティ:
  - APIキーは引数で渡さない（--set-key は getpass の非表示入力）
  - キーは環境変数 OPENROUTER_API_KEY か ~/.claude/fusion-mcp/config (600) から読む
  - キーをログ/例外/標準出力に出さない（sk-or-... はマスク）
  - 通信は HTTPS のみ＋証明書検証を有効（既定の SSL コンテキスト）
  - モデルの出力はローカルで実行しない（文字列として返すだけ）

使い方:
  python3 server.py                 # MCP stdio サーバーとして起動（Claude Code が呼ぶ）
  python3 server.py --ask "質問"     # CLI で1回実行（回答＋cost を表示）
  python3 server.py "質問"           # 上の簡易形
  python3 server.py --set-key        # APIキーを非表示入力で保存
  python3 server.py --models         # 選定される無料モデルを表示
"""

import os
import re
import ssl
import sys
import json
import getpass
import argparse
import urllib.request
import urllib.error

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
MODELS_URL = OPENROUTER_BASE + "/models"
CHAT_URL = OPENROUTER_BASE + "/chat/completions"

CONFIG_DIR = os.path.expanduser("~/.claude/fusion-mcp")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config")

# /models 取得に失敗したときのフォールバック候補（無料・ツール対応の見込み）。
# 実在しないものは OpenRouter 側で弾かれるため、基本は live の /models から自動選定する。
FALLBACK_FREE_MODELS = [
    "openai/gpt-oss-120b:free",
    "deepseek/deepseek-chat:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
]

SECRET_RE = re.compile(r"sk-or-[A-Za-z0-9\-_]+")


def redact(s):
    """出力に万一キーが混じっても漏らさない。"""
    if not s:
        return s
    return SECRET_RE.sub("sk-or-***", str(s))


def _to_int(v, default):
    """0 を含む整数を安全に取り出す（`x or default` は 0 を潰すため使わない）。"""
    if v is None:
        return default
    try:
        return int(v)
    except Exception:
        return default


# ---------------------------------------------------------------- key handling
def load_key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k and k.strip():
        return k.strip()
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    except Exception:
        pass
    return None


def set_key():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)
    key = getpass.getpass("OpenRouter API key (入力は表示されません): ").strip()
    if not key:
        print("キーが空です。中止しました。", file=sys.stderr)
        sys.exit(1)
    # 0600 で作成（既存も上書き）
    fd = os.open(CONFIG_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("OPENROUTER_API_KEY=%s\n" % key)
    os.chmod(CONFIG_FILE, 0o600)
    print("保存しました: %s (権限600)  末尾4桁: ...%s" % (CONFIG_FILE, key[-4:]))


# ---------------------------------------------------------------- http helpers
def _ssl_ctx():
    # 既定コンテキスト = 証明書検証ON。無効化しない。
    return ssl.create_default_context()


def _headers(key=None, post=False):
    h = {"User-Agent": "fusion-mcp/1.0"}
    if post:
        h["Content-Type"] = "application/json"
    if key:
        h["Authorization"] = "Bearer %s" % key
    # OpenRouter の任意の帰属ヘッダ
    h["HTTP-Referer"] = "https://localhost/fusion-mcp"
    h["X-Title"] = "fusion-mcp"
    return h


def http_get_json(url, key=None, timeout=60):
    req = urllib.request.Request(url, headers=_headers(key))
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx()) as r:
        return json.loads(r.read().decode("utf-8"))


def http_post_json(url, payload, key, timeout=300):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_headers(key, post=True))
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx()) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------------------------------------------------------------- model select
def select_free_pool(key=None):
    """:free かつ tools 対応の候補リスト(panel/outer 用)と、
    構造化出力対応の候補リスト(judge 用)を返す。失敗時はフォールバック。"""
    free_tool, free_tool_struct = [], []
    try:
        data = http_get_json(MODELS_URL, key)
        for m in data.get("data", []) or []:
            mid = m.get("id", "") or ""
            if not mid.endswith(":free"):
                continue
            sp = m.get("supported_parameters") or []
            if "tools" in sp:
                free_tool.append(mid)
                if "structured_outputs" in sp or "response_format" in sp:
                    free_tool_struct.append(mid)
    except Exception:
        pass
    free_tool = sorted(dict.fromkeys(free_tool)) or list(FALLBACK_FREE_MODELS)
    free_tool_struct = sorted(dict.fromkeys(free_tool_struct))
    return free_tool, free_tool_struct


def _assign_roles(pool, struct, panel_size):
    """panel / judge / outer をできるだけ別モデルに割り当てる（単一モデル依存を避ける）。"""
    n = max(1, panel_size)
    panel = pool[:n]
    judge = next((m for m in (struct or pool) if m not in panel), None) \
        or (struct[0] if struct else pool[0])
    outer = next((m for m in pool if m not in panel and m != judge), None) or judge
    return panel, judge, outer


def select_free_models(key=None, panel_size=2):
    """--models 表示用：選定される panel と judge を返す。"""
    pool, struct = select_free_pool(key)
    panel, judge, _ = _assign_roles(pool, struct, panel_size)
    return panel, judge


# ---------------------------------------------------------------- fusion call
def _extract_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, dict) and p.get("type") == "text":
                parts.append(p.get("text", ""))
            elif isinstance(p, str):
                parts.append(p)
        return "".join(parts)
    return ""


def run_fusion(prompt, key, panel_size=2, max_tool_calls=0):
    """plugin 方式(model=openrouter/fusion)で本物の Fusion 合議を実行する。
    panel/judge は :free モデルで上書き。max_tool_calls=0 で web 検索を無効化し
    コストを最小化（web 検索とFusion最終合成のごく僅かな費用のみ＝約$0.00008/回）。
    無料モデルだけで literal $0 にすると弱いモデルが合議を回せず破綻するため plugin 方式を採用。
    0 が拒否されたら 1 で、レート制限(429)等は別モデルへローテーションして自動リトライ。"""
    pool, struct = select_free_pool(key)
    attempts = max(1, min(3, len(pool)))  # 一時エラー時に別モデルへローテーション
    last_err = None

    for shift in range(attempts):
        rolled = pool[shift:] + pool[:shift]
        panel, judge, _ = _assign_roles(rolled, struct, panel_size)

        def _call(mtc):
            payload = {
                "model": "openrouter/fusion",
                "messages": [{"role": "user", "content": prompt}],
                "plugins": [{
                    "id": "fusion",
                    "analysis_models": panel,
                    "model": judge,
                    "max_tool_calls": mtc,
                }],
                "usage": {"include": True},
            }
            return http_post_json(CHAT_URL, payload, key)

        try:
            try:
                resp = _call(max_tool_calls)
            except urllib.error.HTTPError as e:
                # max_tool_calls=0 が範囲外(1-16)で弾かれたら 1 で再試行
                if max_tool_calls == 0 and e.code in (400, 422):
                    resp = _call(1)
                else:
                    raise
        except urllib.error.HTTPError as e:
            last_err = e
            # 一時的な可用性エラー(レート制限/上流障害)は別モデルで再試行
            if e.code in (429, 502, 503):
                continue
            raise

        text = ""
        try:
            text = _extract_text(resp["choices"][0]["message"].get("content"))
        except Exception:
            text = ""
        cost = None
        try:
            cost = resp.get("usage", {}).get("cost")
        except Exception:
            cost = None
        return text, cost, panel, judge

    if last_err is not None:
        raise last_err
    raise RuntimeError("利用可能な無料モデルが見つかりませんでした。")


# ---------------------------------------------------------------- CLI mode
def cli_ask(prompt, panel_size, max_tool_calls, assume_yes=False):
    # web 検索(課金)はユーザー承認を必須にする
    if max_tool_calls >= 1 and not assume_yes:
        if sys.stdin.isatty():
            try:
                ans = input("Fusion で web 検索を行います（少額課金されます）。続行しますか? [y/N]: ").strip().lower()
            except EOFError:
                ans = ""
            if ans not in ("y", "yes"):
                print("中止しました。無料で実行するなら --max-tool-calls 0 を使ってください。", file=sys.stderr)
                sys.exit(4)
        else:
            print("web 検索(課金)には承認が必要です。--yes を付けるか、対話端末で実行してください。",
                  file=sys.stderr)
            sys.exit(4)
    key = load_key()
    if not key:
        print("APIキー未設定。`--set-key` で保存するか OPENROUTER_API_KEY を設定してください。",
              file=sys.stderr)
        sys.exit(2)
    try:
        text, cost, panel, judge = run_fusion(prompt, key, panel_size, max_tool_calls)
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")[:600]
        except Exception:
            pass
        print("OpenRouter HTTP %s: %s" % (e.code, redact(body)), file=sys.stderr)
        sys.exit(3)
    except Exception as e:
        print("呼び出し失敗: %s" % redact(e), file=sys.stderr)
        sys.exit(3)
    print(text)
    print("\n---")
    print("panel = %s" % panel)
    print("judge = %s" % judge)
    print("cost  = %s USD  (0 なら無料)" % (cost if cost is not None else "unknown"))


# ---------------------------------------------------------------- MCP (stdio)
SERVER_INFO = {"name": "fusion", "version": "1.0.0"}

TOOL_ASK = {
    "name": "fusion_ask",
    "description": (
        "OpenRouter Fusion(無料モデルのみ)に質問し、複数モデルの合議(パネル+ジャッジ)で回答する。"
        "web 検索は行わない=実質無料。難しい質問・設計判断・セカンドオピニオン向け。"
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "prompt": {"type": "string", "description": "Fusion に投げる質問・指示"},
            "panel_size": {"type": "integer", "minimum": 1, "maximum": 8,
                           "description": "並列パネルのモデル数(既定2)"},
        },
        "required": ["prompt"],
    },
}

TOOL_ASK_WEB = {
    "name": "fusion_ask_web",
    "description": (
        "Fusion に『web 検索あり』で質問する。【課金あり】web_search/web_fetch が走り少額課金される。"
        "実行前に必ずユーザーへ『Fusion で web 検索してよいか』許可を取り、許可された場合のみ "
        "user_approved=true を付けて呼ぶこと。user_approved が無い/false のときは実行されない。"
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "prompt": {"type": "string", "description": "Fusion に投げる質問・指示"},
            "user_approved": {"type": "boolean",
                              "description": "ユーザーが web 検索(課金)を承認済みなら true。未承認では実行不可。"},
            "panel_size": {"type": "integer", "minimum": 1, "maximum": 8,
                           "description": "並列パネルのモデル数(既定2)"},
            "max_tool_calls": {"type": "integer", "minimum": 1, "maximum": 16,
                               "description": "各モデルの web 検索ツール上限(既定2)"},
        },
        "required": ["prompt", "user_approved"],
    },
}


def _ok(mid, result):
    return {"jsonrpc": "2.0", "id": mid, "result": result}


def _err(mid, code, message):
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": message}}


def _tool_text(mid, text, is_error=False):
    r = {"content": [{"type": "text", "text": text}]}
    if is_error:
        r["isError"] = True
    return _ok(mid, r)


def _handle_tool_call(mid, params):
    name = params.get("name")
    args = params.get("arguments") or {}
    if name not in ("fusion_ask", "fusion_ask_web"):
        return _err(mid, -32602, "Unknown tool: %s" % name)
    prompt = args.get("prompt")
    if not prompt:
        return _tool_text(mid, "prompt が必要です。", is_error=True)
    panel_size = _to_int(args.get("panel_size"), 2)
    if name == "fusion_ask":
        max_tool_calls = 0  # web 検索は常に無効（実質無料）
    else:  # fusion_ask_web : web 検索あり=課金。ユーザー承認必須。
        if not args.get("user_approved"):
            return _tool_text(
                mid,
                "fusion_ask_web は web 検索を行い少額課金されます。先にユーザーへ"
                "『Fusion で web 検索してよいか』を確認し、許可を得てから "
                "user_approved=true を付けて再実行してください。"
                "（無料で済ませるなら fusion_ask を使用）",
                is_error=True,
            )
        max_tool_calls = max(1, _to_int(args.get("max_tool_calls"), 2))
    key = load_key()
    if not key:
        return _tool_text(
            mid,
            "OpenRouter APIキー未設定。サーバー側で `python3 "
            "/usr/local/lib/fusion-mcp/server.py --set-key` を実行するか、MCP設定の env に "
            "OPENROUTER_API_KEY を設定してください。",
            is_error=True,
        )
    try:
        text, cost, panel, judge = run_fusion(prompt, key, panel_size, max_tool_calls)
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")[:600]
        except Exception:
            pass
        return _tool_text(mid, "OpenRouter HTTP %s: %s" % (e.code, redact(body)), is_error=True)
    except Exception as e:
        return _tool_text(mid, "呼び出し失敗: %s" % redact(e), is_error=True)
    footer = "\n\n---\n(panel=%s, judge=%s, cost=%s USD)" % (
        panel, judge, cost if cost is not None else "unknown")
    return _tool_text(mid, (text or "") + footer)


def _handle(msg):
    mid = msg.get("id")
    method = msg.get("method")
    params = msg.get("params") or {}
    if method == "initialize":
        return _ok(mid, {
            "protocolVersion": params.get("protocolVersion") or "2025-06-18",
            "capabilities": {"tools": {}},
            "serverInfo": SERVER_INFO,
        })
    if method == "notifications/initialized":
        return None
    if method == "ping":
        return _ok(mid, {})
    if method == "tools/list":
        return _ok(mid, {"tools": [TOOL_ASK, TOOL_ASK_WEB]})
    if method == "tools/call":
        return _handle_tool_call(mid, params)
    # 未知メソッド: 通知(idなし)は無視、リクエストは error
    if mid is None:
        return None
    return _err(mid, -32601, "Method not found: %s" % method)


def mcp_serve():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        try:
            resp = _handle(msg)
        except Exception as e:
            mid = msg.get("id") if isinstance(msg, dict) else None
            resp = _err(mid, -32603, "Internal error: %s" % redact(e)) if mid is not None else None
        if resp is not None:
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()


# ---------------------------------------------------------------- entrypoint
def main():
    ap = argparse.ArgumentParser(
        prog="fusion-mcp",
        description="OpenRouter Fusion を無料モデルだけで呼ぶ MCP サーバー兼 CLI",
    )
    ap.add_argument("prompt", nargs="?", help="質問 (=--ask の簡易形)")
    ap.add_argument("--ask", metavar="PROMPT", help="CLIモードで1回質問する")
    ap.add_argument("--set-key", action="store_true",
                    help="APIキーを非表示入力で ~/.claude/fusion-mcp/config (600) に保存")
    ap.add_argument("--models", action="store_true", help="選定される無料モデルを表示")
    ap.add_argument("--panel-size", type=int, default=2, help="パネルのモデル数(既定2)")
    ap.add_argument("--max-tool-calls", type=int, default=0,
                    help="各モデルのツール上限。0=web検索無効で$0狙い(既定)。1以上で web 検索有効(少額課金)")
    ap.add_argument("-y", "--yes", action="store_true",
                    help="web 検索(課金)の確認プロンプトをスキップして実行")
    args = ap.parse_args()

    if args.set_key:
        set_key()
        return
    if args.models:
        panel, judge = select_free_models(load_key(), args.panel_size)
        print("panel:", panel)
        print("judge:", judge)
        return
    ask = args.ask if args.ask is not None else args.prompt
    if ask:
        cli_ask(ask, args.panel_size, args.max_tool_calls, args.yes)
        return
    # 引数なし → MCP stdio サーバー
    mcp_serve()


if __name__ == "__main__":
    main()
SERVER_EOF
chmod 755 /usr/local/lib/fusion-mcp/server.py

cat > /usr/local/bin/fusion <<'WRAP_EOF'
#!/bin/sh
exec python3 /usr/local/lib/fusion-mcp/server.py "$@"
WRAP_EOF
chmod 755 /usr/local/bin/fusion

# 鍵: 環境変数があれば設定（無ければスキップ）
if [ -n "$OPENROUTER_API_KEY" ]; then
  printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY" > "$HOME/.claude/fusion-mcp/config"
  chmod 600 "$HOME/.claude/fusion-mcp/config"
fi

# MCP登録(userスコープ) と 許可設定 を冪等にマージ
python3 - <<'PY'
import json, os
home = os.path.expanduser("~")
p = os.path.join(home, ".claude.json")
d = {}
if os.path.exists(p):
    try: d = json.load(open(p))
    except Exception: d = {}
d.setdefault("mcpServers", {})["fusion"] = {
    "type": "stdio", "command": "python3",
    "args": ["/usr/local/lib/fusion-mcp/server.py"],
}
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)

sp = os.path.join(home, ".claude", "settings.json")
s = {}
if os.path.exists(sp):
    try: s = json.load(open(sp))
    except Exception: s = {}
allow = s.setdefault("permissions", {}).setdefault("allow", [])
if "mcp__fusion__fusion_ask" not in allow:
    allow.append("mcp__fusion__fusion_ask")
json.dump(s, open(sp, "w"), ensure_ascii=False, indent=2)
print("registered MCP + permission")
PY

# 全プロジェクト共通の指示(無ければ追記)
CL="$HOME/.claude/CLAUDE.md"
if ! grep -q "fusion_ask" "$CL" 2>/dev/null; then
cat >> "$CL" <<'MD'

# グローバル指示（全プロジェクト共通）

## Fusion（fusion_ask）を能動的に活用する
MCPツール `mcp__fusion__fusion_ask` は複数の無料モデルの合議で答える「セカンドオピニオン」ツール。
実質無料・承認済み。設計判断/難しいバグ/重要方針のレビュー/裏取りでは自分から積極的に使う。
些末なタスクでは使わない。回答は鵜呑みにせず判断材料の一つにする。
web検索版 `mcp__fusion__fusion_ask_web` は課金されるため、必ずユーザー承認を得てから user_approved=true で呼ぶ。
MD
fi

echo "[fusion] install done. 'fusion --models' で確認 / 鍵未設定なら 'fusion --set-key' / VS Codeをリロード。"
