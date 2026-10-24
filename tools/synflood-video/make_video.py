"""SYN Flood 解説動画ジェネレータ (PIL -> ffmpeg)"""
import math
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 30
from fonts import FONT, MONO
_fc = {}


def f(size, mono=False):
    key = (size, mono)
    if key not in _fc:
        _fc[key] = ImageFont.truetype(MONO if mono else FONT, size)
    return _fc[key]


BG = (11, 17, 32)
PANEL = (24, 33, 52)
LINE = (51, 65, 85)
TXT = (226, 232, 240)
DIM = (148, 163, 184)
C_SYN = (56, 189, 248)
C_SYNACK = (167, 139, 250)
C_ACK = (74, 222, 128)
C_ATK = (248, 113, 113)
C_WARN = (250, 204, 21)
C_COOKIE = (251, 146, 60)

# ---- 配置 ----
P = {
    "client": (150, 215),
    "attacker": (150, 470),
    "server": (640, 340),
    "cloud": (430, 548),
}


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def mix(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def edge_points(src, dst, off=85):
    (x0, y0), (x1, y1) = P[src], P[dst]
    dx, dy = x1 - x0, y1 - y0
    d = math.hypot(dx, dy)
    ux, uy = dx / d, dy / d
    o0 = 60 if src == "cloud" else off
    o1 = 60 if dst == "cloud" else off
    return (x0 + ux * o0, y0 + uy * o0), (x1 - ux * o1, y1 - uy * o1)


def text_c(d, xy, s, font, fill):
    d.text(xy, s, font=font, fill=fill, anchor="mm")


def node(d, key, name, sub, state, color, alpha=1.0):
    if alpha <= 0:
        return
    x, y = P[key]
    col = mix(BG, color, alpha)
    d.rounded_rectangle((x - 80, y - 42, x + 80, y + 42), 12,
                        fill=mix(BG, PANEL, alpha), outline=col, width=3)
    text_c(d, (x, y - 14), name, f(22), mix(BG, TXT, alpha))
    text_c(d, (x, y + 14), sub, f(15, True), mix(BG, DIM, alpha))
    if state:
        s, sc = state
        text_c(d, (x, y + 62), s, f(18), mix(BG, sc, alpha))


def cloud(d, alpha):
    if alpha <= 0:
        return
    x, y = P["cloud"]
    c = mix(BG, (71, 85, 105), alpha)
    for dx, dy, r in [(-50, 4, 26), (-18, -12, 32), (22, -8, 30), (52, 6, 24), (0, 12, 30)]:
        d.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=c)
    text_c(d, (x, y - 4), "偽装された送信元IP", f(15), mix(BG, TXT, alpha))
    text_c(d, (x, y + 16), "(存在しない / 応答しない)", f(13), mix(BG, DIM, alpha))


def packet(d, pk, t):
    t0, t1 = pk["t0"], pk["t1"]
    if t < t0:
        return
    a, b = edge_points(pk["src"], pk["dst"])
    col = pk["color"]
    if t <= t1:
        # 経路ライン
        d.line((a, b), fill=mix(BG, col, 0.35), width=2)
        p = ease((t - t0) / (t1 - t0))
        x, y = lerp(a[0], b[0], p), lerp(a[1], b[1], p)
        fade = 1.0
        if pk.get("lost"):
            fade = clamp((1 - p) / 0.25)  # 宛先に近づくと消える
        label = pk["label"]
        tw = d.textlength(label, font=f(15)) + 18
        d.rounded_rectangle((x - tw / 2, y - 14, x + tw / 2, y + 14), 8,
                            fill=mix(BG, col, 0.9 * fade), outline=mix(BG, (255, 255, 255), 0.6 * fade))
        text_c(d, (x, y), label, f(15), mix(BG, (10, 15, 25), fade))
    elif pk.get("drop") and t < t1 + 1.0:
        x, y = b
        k = 1 - (t - t1)
        c = mix(BG, C_ATK, k)
        d.line((x - 14, y - 14, x + 14, y + 14), fill=c, width=5)
        d.line((x - 14, y + 14, x + 14, y - 14), fill=c, width=5)
        text_c(d, (x, y - 26), "破棄", f(15), c)
    elif pk.get("lost") and t < t1 + 0.8:
        x, y = b
        text_c(d, (x + 18, y - 18), "?", f(26), mix(BG, DIM, 1 - (t - t1) / 0.8))


def header(d, step, total, title, t, dur):
    d.rectangle((0, 0, W, 64), fill=PANEL)
    d.text((28, 32), title, font=f(28), fill=TXT, anchor="lm")
    d.text((W - 28, 32), f"STEP {step}/{total}", font=f(18, True), fill=DIM, anchor="rm")


def caption(d, caps, t):
    cur = None
    for ts, s in caps:
        if t >= ts:
            cur = (ts, s)
    if not cur:
        return
    a = clamp((t - cur[0]) / 0.35)
    d.rectangle((0, 64, W, 114), fill=(17, 24, 39))
    d.text((28, 89), cur[1], font=f(22), fill=mix((17, 24, 39), C_WARN, a), anchor="lm")


def backlog_panel(d, slots, t, title="サーバのSYNバックログ(半開接続キュー)", note=None, chart=None):
    x0, y0, x1, y1 = 865, 128, 1258, 580
    d.rounded_rectangle((x0, y0, x1, y1), 10, fill=PANEL, outline=LINE, width=2)
    d.text((x0 + 14, y0 + 20), title, font=f(16), fill=TXT, anchor="lm")
    used = sum(1 for s in slots if s)
    full = used >= len(slots)
    cnt_col = C_ATK if full else (C_WARN if used else DIM)
    d.text((x1 - 14, y0 + 20), f"{used}/{len(slots)}", font=f(18, True), fill=cnt_col, anchor="rm")
    for i, s in enumerate(slots):
        ry = y0 + 42 + i * 33
        box = (x0 + 14, ry, x1 - 14, ry + 27)
        if not s:
            d.rounded_rectangle(box, 6, outline=LINE, width=1)
            d.text((x0 + 26, ry + 14), "空き", font=f(14), fill=(71, 85, 105), anchor="lm")
            continue
        state, src, col, born = s
        k = clamp((t - born) / 0.3)
        d.rounded_rectangle(box, 6, fill=mix(PANEL, mix(BG, col, 0.35), k), outline=mix(PANEL, col, k), width=2)
        d.text((x0 + 26, ry + 14), state, font=f(14, True), fill=mix(PANEL, col, k), anchor="lm")
        d.text((x0 + 130, ry + 14), src, font=f(14, True), fill=mix(PANEL, TXT, k), anchor="lm")
        if state == "SYN_RCVD":
            # ACK待ちのインジケータ
            ph = (t * 2 + i * 0.3) % 1
            d.text((x1 - 24, ry + 14), "ACK待ち" + "." * (int(ph * 3) + 1), font=f(13), fill=DIM, anchor="rm")
    if full:
        blink = 0.5 + 0.5 * math.sin(t * 8)
        d.text(((x0 + x1) / 2, y0 + 42 + len(slots) * 33 + 10), "満杯 ― 新しいSYNは破棄",
               font=f(17), fill=mix(PANEL, C_ATK, 0.5 + 0.5 * blink), anchor="mm")
    if note:
        for j, line in enumerate(note):
            d.text((x0 + 14, y0 + 330 + j * 24), line, font=f(15), fill=DIM, anchor="lm")
    if chart:
        series, dur, cap = chart
        cx0, cy0, cx1, cy1 = x0 + 40, 494, x1 - 18, 566
        d.text((x0 + 14, 476), "半開接続数の推移", font=f(14), fill=DIM, anchor="lm")
        d.line((cx0, cy1, cx1, cy1), fill=LINE, width=1)
        d.line((cx0, cy0, cx0, cy1), fill=LINE, width=1)
        yc = cy1 - (cy1 - cy0) * 1.0
        d.line((cx0, yc, cx1, yc), fill=mix(PANEL, C_ATK, 0.5), width=1)
        d.text((cx0 - 6, yc), str(cap), font=f(12), fill=C_ATK, anchor="rm")
        d.text((cx0 - 6, cy1), "0", font=f(12), fill=DIM, anchor="rm")
        pts = []
        n = 120
        for k in range(n + 1):
            tt = dur * k / n
            if tt > t:
                break
            v = series(tt)
            pts.append((cx0 + (cx1 - cx0) * tt / dur, cy1 - (cy1 - cy0) * v / cap))
        if len(pts) > 1:
            d.line(pts, fill=C_WARN, width=3)


def timeline(d, pkts, t, dur):
    x0, x1, y = 40, 820, 668
    d.rounded_rectangle((20, 592, 845, 712), 10, fill=PANEL, outline=LINE, width=2)
    d.text((36, 612), "タイムライン", font=f(15), fill=DIM, anchor="lm")
    d.text((830, 612), f"t = {t:5.2f} s", font=f(16, True), fill=TXT, anchor="rm")
    d.line((x0, y, x1, y), fill=LINE, width=4)
    px = x0 + (x1 - x0) * clamp(t / dur)
    d.line((x0, y, px, y), fill=DIM, width=4)
    for pk in pkts:
        if pk["t0"] > t:
            continue
        tx = x0 + (x1 - x0) * pk["t0"] / dur
        d.line((tx, y - 14, tx, y + 14), fill=pk["color"], width=3)
    for s in range(0, int(dur) + 1, 2):
        sx = x0 + (x1 - x0) * s / dur
        d.text((sx, y + 26), f"{s}s", font=f(12), fill=DIM, anchor="mm")
    d.ellipse((px - 7, y - 7, px + 7, y + 7), fill=C_WARN)
    # 凡例
    lx = 180
    for name, c in [("SYN", C_SYN), ("SYN-ACK", C_SYNACK), ("ACK", C_ACK), ("攻撃SYN", C_ATK)]:
        d.rectangle((lx, 606, lx + 12, 618), fill=c)
        d.text((lx + 18, 612), name, font=f(13), fill=DIM, anchor="lm")
        lx += 95


def event_log(d, pkts, t):
    x0, y0 = 865, 592
    d.rounded_rectangle((x0, y0, 1258, 712), 10, fill=PANEL, outline=LINE, width=2)
    d.text((x0 + 14, y0 + 18), "イベントログ", font=f(15), fill=DIM, anchor="lm")
    names = {"client": "Client", "attacker": "Attacker", "server": "Server", "cloud": "偽装IP"}
    evs = [pk for pk in pkts if pk["t0"] <= t]
    for j, pk in enumerate(evs[-4:]):
        src = pk.get("src_name", names[pk["src"]])
        dst = pk.get("dst_name", names[pk["dst"]])
        s = f"{pk['t0']:5.2f}s {pk['label']:<15} {src}→{dst}"
        if pk.get("drop") and t >= pk["t1"]:
            s += " 破棄"
        d.text((x0 + 14, y0 + 42 + j * 19), s, font=f(13, True), fill=pk["color"], anchor="lm")


def state_at(seq, t):
    cur = seq[0][1:]
    for ts, s, c in seq:
        if t >= ts:
            cur = (s, c)
    return cur


# ======================= シーン定義 =======================

def scene_title(d, t, dur):
    a = clamp(t / 0.8) * clamp((dur - t) / 0.5)
    text_c(d, (W / 2, 300), "SYN Flood 攻撃のしくみ", f(60), mix(BG, TXT, a))
    text_c(d, (W / 2, 380), "TCP 3ウェイハンドシェイクを悪用した DoS 攻撃を時系列で理解する", f(24), mix(BG, DIM, a))
    text_c(d, (W / 2, 440), "※ 時間は説明用に引き伸ばしています", f(18), mix(BG, (100, 116, 139), a))


def mk(t0, dt, src, dst, label, color, **kw):
    pk = dict(t0=t0, t1=t0 + dt, src=src, dst=dst, label=label, color=color)
    pk.update(kw)
    return pk


NORMAL_PK = [
    mk(1.0, 1.2, "client", "server", "SYN", C_SYN),
    mk(2.6, 1.2, "server", "client", "SYN-ACK", C_SYNACK),
    mk(4.4, 1.2, "client", "server", "ACK", C_ACK),
]
NORMAL_CAPS = [
    (0.0, "まずは正常な TCP 接続（3ウェイハンドシェイク）"),
    (1.0, "① クライアントが SYN を送信（接続したい）"),
    (2.2, "② サーバはバックログに枠を確保し、SYN-ACK を返す"),
    (4.2, "③ クライアントが ACK を返す"),
    (5.6, "④ 接続確立（ESTABLISHED）→ 枠はアプリに引き渡されて解放"),
    (8.0, "ポイント：ACK が届くまで、サーバは『半開接続』として枠を保持し続ける"),
]


def scene_normal(d, t, dur):
    header(d, 1, 4, "正常な TCP 接続", t, dur)
    caption(d, NORMAL_CAPS, t)
    node(d, "client", "正規クライアント", "192.0.2.10",
         state_at([(0, "CLOSED", DIM), (1.0, "SYN_SENT", C_SYN), (4.4, "ESTABLISHED", C_ACK)], t), C_SYN)
    node(d, "server", "Webサーバ", "198.51.100.1:443",
         state_at([(0, "LISTEN", DIM), (2.2, "SYN_RCVD", C_WARN), (5.6, "ESTABLISHED", C_ACK)], t), (148, 163, 184))
    for pk in NORMAL_PK:
        packet(d, pk, t)
    slots = [None] * 8
    if 2.2 <= t < 5.6:
        slots[0] = ("SYN_RCVD", "192.0.2.10", C_WARN, 2.2)
    elif 5.6 <= t < 7.2:
        slots[0] = ("ESTABLISHED", "192.0.2.10", C_ACK, 5.6)
    backlog_panel(d, slots, t, note=["SYN を受けると 1 枠確保（SYN_RCVD）", "ACK で確立すると枠は解放される"])
    timeline(d, NORMAL_PK, t, dur)
    event_log(d, NORMAL_PK, t)


SPOOF = ["203.0.113.17", "198.18.4.201", "203.0.113.88", "192.0.2.250", "198.18.77.3",
         "203.0.113.140", "198.18.9.66", "203.0.113.5", "198.18.200.9", "203.0.113.61",
         "198.18.31.4", "203.0.113.222", "198.18.5.150", "203.0.113.99"]
N_SLOTS = 8


def build_flood():
    pk, slots, drops = [], [], []
    for i, ip in enumerate(SPOOF):
        t0 = 1.0 + i * 0.8
        arr = t0 + 0.9
        if i < N_SLOTS:
            pk.append(mk(t0, 0.9, "attacker", "server", "SYN", C_ATK, src_name=ip))
            slots.append((arr, ip))
            pk.append(mk(arr + 0.15, 0.9, "server", "cloud", "SYN-ACK", C_SYNACK, lost=True, dst_name=ip))
        else:
            pk.append(mk(t0, 0.9, "attacker", "server", "SYN", C_ATK, src_name=ip, drop=True))
    # SYN-ACK 再送
    for arr, ip in slots[:5]:
        pk.append(mk(arr + 4.0, 0.9, "server", "cloud", "SYN-ACK再送", (120, 110, 170), lost=True, dst_name=ip))
    # 正規クライアント
    pk.append(mk(13.4, 1.0, "client", "server", "SYN", C_SYN, drop=True))
    pk.append(mk(16.6, 1.0, "client", "server", "SYN(再送)", C_SYN, drop=True))
    pk.sort(key=lambda p: p["t0"])
    return pk, slots


FLOOD_PK, FLOOD_SLOTS = build_flood()
FLOOD_CAPS = [
    (0.0, "攻撃者が送信元 IP を偽装した SYN を大量に送りつける"),
    (2.0, "サーバは SYN ごとに半開接続(SYN_RCVD)の枠を確保し、SYN-ACK を返す"),
    (4.2, "SYN-ACK は偽装 IP 宛て → 誰も ACK を返さない → 枠は解放されない"),
    (7.6, "バックログが満杯に。これ以降に届いた SYN はすべて破棄される"),
    (13.4, "正規ユーザーの SYN も破棄 → 接続できない ＝ サービス拒否（DoS）"),
    (18.0, "半開接続はタイムアウト（Linux既定で約60秒）まで残り、攻撃者は送り続けるだけで枠を埋め続けられる"),
]


def flood_count(t):
    return sum(1 for arr, _ in FLOOD_SLOTS if t >= arr)


def scene_flood(d, t, dur):
    header(d, 2, 4, "SYN Flood 攻撃", t, dur)
    caption(d, FLOOD_CAPS, t)
    ca = clamp(t / 0.6)
    full = flood_count(t) >= N_SLOTS
    node(d, "attacker", "攻撃者", "送信元IPを偽装",
         ("SYN を連射", C_ATK) if t >= 1.0 else None, C_ATK, ca)
    cloud(d, ca)
    client_state = state_at([(0, "CLOSED", DIM), (13.4, "SYN_SENT", C_SYN), (14.6, "応答なし…", C_ATK),
                             (16.6, "SYN_SENT(再送)", C_SYN), (17.8, "接続できない", C_ATK)], t)
    node(d, "client", "正規クライアント", "192.0.2.10", client_state, C_SYN, clamp((t - 11.5) / 0.8))
    srv_state = ("LISTEN", DIM)
    if flood_count(t) > 0:
        srv_state = (f"SYN_RCVD ×{flood_count(t)}", C_WARN)
    if full:
        srv_state = ("バックログ満杯", C_ATK)
    node(d, "server", "Webサーバ", "198.51.100.1:443", srv_state, C_ATK if full else (148, 163, 184))
    for pk in FLOOD_PK:
        packet(d, pk, t)
    slots = [None] * N_SLOTS
    for i, (arr, ip) in enumerate(FLOOD_SLOTS):
        if t >= arr:
            slots[i] = ("SYN_RCVD", ip, C_ATK, arr)
    backlog_panel(d, slots, t, chart=(flood_count, dur, N_SLOTS))
    timeline(d, FLOOD_PK, t, dur)
    event_log(d, FLOOD_PK, t)


def build_cookie():
    pk = []
    for i, ip in enumerate(SPOOF[:6]):
        t0 = 1.0 + i * 0.7
        pk.append(mk(t0, 0.9, "attacker", "server", "SYN", C_ATK, src_name=ip))
        pk.append(mk(t0 + 1.05, 0.9, "server", "cloud", "SYN-ACK(Cookie)", C_COOKIE, lost=True, dst_name=ip))
    pk.append(mk(5.8, 1.0, "client", "server", "SYN", C_SYN))
    pk.append(mk(7.0, 1.0, "server", "client", "SYN-ACK(Cookie)", C_COOKIE))
    pk.append(mk(8.4, 1.0, "client", "server", "ACK(Cookie+1)", C_ACK))
    pk.sort(key=lambda p: p["t0"])
    return pk


COOKIE_PK = build_cookie()
COOKIE_CAPS = [
    (0.0, "対策の代表例：SYN Cookie"),
    (1.0, "SYN を受けても枠を確保せず、接続情報をシーケンス番号(Cookie)に埋め込んで返す"),
    (5.8, "偽装 SYN が大量に来ても、バックログは空のまま"),
    (8.4, "正規クライアントは Cookie を含む ACK を返す"),
    (9.4, "Cookie を検証できた時点で初めて接続を確立 → 正規ユーザーは接続できる"),
    (12.5, "他の対策：バックログ拡大 / SYN-ACK 再送回数の削減 / レート制限 / 上流での DDoS 防御"),
]


def scene_cookie(d, t, dur):
    header(d, 3, 4, "対策：SYN Cookie", t, dur)
    caption(d, COOKIE_CAPS, t)
    node(d, "attacker", "攻撃者", "送信元IPを偽装", ("SYN を連射", C_ATK) if t >= 1.0 else None, C_ATK)
    cloud(d, 1.0)
    node(d, "client", "正規クライアント", "192.0.2.10",
         state_at([(0, "CLOSED", DIM), (5.8, "SYN_SENT", C_SYN), (8.4, "ESTABLISHED", C_ACK)], t), C_SYN)
    srv = ("LISTEN（SYN Cookie 有効）", C_COOKIE)
    if 9.4 <= t < 11.0:
        srv = ("Cookie 検証 OK ✓", C_ACK)
    elif t >= 11.0:
        srv = ("ESTABLISHED", C_ACK)
    node(d, "server", "Webサーバ", "198.51.100.1:443", srv, C_COOKIE)
    for pk in COOKIE_PK:
        packet(d, pk, t)
    slots = [None] * N_SLOTS
    if 9.4 <= t < 11.5:
        slots[0] = ("ESTABLISHED", "192.0.2.10", C_ACK, 9.4)
    backlog_panel(d, slots, t, note=["SYN 受信時は状態を保存しない", "→ 偽装 SYN では枠が埋まらない",
                                     "", "Cookie = ハッシュ(送信元/宛先IP・ポート,", "              時刻, 秘密鍵) など"])
    timeline(d, COOKIE_PK, t, dur)
    event_log(d, COOKIE_PK, t)


SUMMARY = [
    ("1. 正常時", "SYN → SYN-ACK → ACK。ACK が来るまでサーバは枠(半開接続)を保持", C_ACK),
    ("2. 攻撃", "送信元偽装の SYN を大量送信。ACK は返ってこない", C_ATK),
    ("3. 枯渇", "半開接続がバックログを埋め尽くし、新しい SYN は破棄", C_WARN),
    ("4. 影響", "正規ユーザーが接続できない ＝ サービス拒否 (DoS)", C_ATK),
    ("5. 対策", "SYN Cookie / バックログ拡大 / 再送回数削減 / レート制限 / DDoS防御", C_COOKIE),
]


def scene_summary(d, t, dur):
    header(d, 4, 4, "まとめ", t, dur)
    for i, (h, s, c) in enumerate(SUMMARY):
        a = clamp((t - 0.4 - i * 0.6) / 0.5)
        y = 170 + i * 90
        x = 120 + (1 - a) * 40
        d.rounded_rectangle((x, y, x + 1040, y + 70), 12, fill=mix(BG, PANEL, a), outline=mix(BG, c, a), width=3)
        d.text((x + 28, y + 35), h, font=f(26), fill=mix(BG, c, a), anchor="lm")
        d.text((x + 190, y + 35), s, font=f(22), fill=mix(BG, TXT, a), anchor="lm")
        if i < len(SUMMARY) - 1:
            d.line((x + 70, y + 72, x + 70, y + 88), fill=mix(BG, LINE, a), width=3)


SCENES = [(scene_title, 4.0), (scene_normal, 10.5), (scene_flood, 22.0), (scene_cookie, 16.0), (scene_summary, 9.0)]


NARR = {
    scene_title: [(0.3, "シンフラッド攻撃の仕組みを、時系列で見ていきましょう。")],
    scene_normal: [
        (0.0, "まずは、正常なティーシーピー接続の流れです。"),
        (1.0, "クライアントが、接続要求のシンを送ります。"),
        (2.2, "サーバーは、バックログに枠を一つ確保し、シンアックを返します。"),
        (4.2, "クライアントがアックを返すと、"),
        (5.6, "接続が確立し、枠はアプリケーションに引き渡されて解放されます。"),
        (8.0, "ポイントは、アックが届くまで、サーバーが半開接続として枠を持ち続けることです。"),
    ],
    scene_flood: [
        (0.0, "攻撃者が、送信元のアイピーアドレスを偽装したシンを、大量に送りつけます。"),
        (2.0, "サーバーは、シンを受け取るたびに半開接続の枠を確保し、シンアックを返します。"),
        (4.2, "しかし、シンアックの宛先は偽装されたアドレスです。誰もアックを返さないため、枠は解放されません。"),
        (7.6, "やがてバックログが満杯になり、それ以降に届いたシンは、すべて破棄されます。"),
        (13.4, "正規のユーザーが送ったシンも破棄され、接続できなくなります。これが、サービス拒否、ドスの状態です。"),
        (18.0, "半開接続はタイムアウトまで残り続けるため、攻撃者はシンを送り続けるだけで、枠を埋め続けることができます。"),
    ],
    scene_cookie: [
        (0.0, "代表的な対策が、シンクッキーです。"),
        (1.0, "サーバーはシンを受けても枠を確保せず、接続情報をシーケンス番号、つまりクッキーに埋め込んで返します。"),
        (5.8, "そのため、偽装されたシンが大量に届いても、バックログは空のままです。"),
        (8.4, "正規のクライアントは、クッキーを含んだアックを返します。"),
        (9.4, "サーバーは、クッキーを検証できた時点で、初めて接続を確立します。"),
        (12.5, "ほかにも、バックログの拡大、シンアック再送回数の削減、レート制限、上流でのディードス防御といった対策があります。"),
    ],
    scene_summary: [
        (0.0, "まとめです。"),
        (0.4, "正常時、サーバーはアックが届くまで、半開接続の枠を保持します。"),
        (1.0, "攻撃者は、送信元を偽装したシンを大量に送ります。"),
        (1.6, "半開接続がバックログを埋め尽くし、新しいシンは破棄されます。"),
        (2.2, "その結果、正規のユーザーが接続できなくなります。"),
        (2.8, "対策として、シンクッキーなどを組み合わせることが重要です。"),
    ],
}
SR = 48000
LEAD, TAIL = 0.2, 0.6


def tts(text):
    import numpy as np
    import pyopenjtalk
    x, sr = pyopenjtalk.tts(text, speed=1.1)
    assert sr == SR
    return np.asarray(x, dtype=np.float32) / 32768.0


def plan(fn, dur):
    """ナレーションに合わせて区間ごとに尺を伸ばす。[(visual0, visual1, real0, real1)] と音声配置を返す"""
    narr = dict(NARR.get(fn, []))
    bounds = sorted({0.0, dur, *narr})
    segs, clips, r = [], [], 0.0
    for v0, v1 in zip(bounds, bounds[1:]):
        need = 0.0
        if v0 in narr:
            a = tts(narr[v0])
            clips.append((r + LEAD, a))
            need = LEAD + len(a) / SR + TAIL
        rl = max(v1 - v0, need)
        segs.append((v0, v1, r, r + rl))
        r += rl
    return segs, clips, r


def warp(segs, tr):
    for v0, v1, r0, r1 in segs:
        if tr < r1:
            return v0 + (tr - r0) * (v1 - v0) / (r1 - r0)
    return segs[-1][1]


def render(out):
    import numpy as np
    import scipy.io.wavfile as wavfile
    plans = [(fn, dur) + plan(fn, dur) for fn, dur in SCENES]
    total = sum(p[4] for p in plans)
    audio = np.zeros(int((total + 1) * SR), dtype=np.float32)
    base = 0.0
    for _, _, _, clips, rdur in plans:
        for st, a in clips:
            i = int((base + st) * SR)
            audio[i:i + len(a)] += a
        base += int(rdur * FPS) / FPS
    audio = audio[:int(base * SR)]
    audio *= 0.9 / max(1e-6, float(np.abs(audio).max()))
    wav = out + ".wav"
    wavfile.write(wav, SR, (audio * 32767).astype(np.int16))
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
         "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out],
        stdin=subprocess.PIPE)
    black = Image.new("RGB", (W, H), (0, 0, 0))
    for fn, dur, segs, _, rdur in plans:
        for k in range(int(rdur * FPS)):
            tr = k / FPS
            t = warp(segs, tr)
            img = Image.new("RGB", (W, H), BG)
            d = ImageDraw.Draw(img)
            fn(d, t, dur)
            fade = min(clamp(tr / 0.4), clamp((rdur - tr) / 0.4))
            if fade < 1:
                img = Image.blend(black, img, fade)
            proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"done: {out} ({base:.1f}s)")


def still(t_global, out):
    acc = 0
    for fn, dur in SCENES:
        if t_global < acc + dur:
            img = Image.new("RGB", (W, H), BG)
            fn(ImageDraw.Draw(img), t_global - acc, dur)
            img.save(out)
            return
        acc += dur


if __name__ == "__main__":
    if sys.argv[1] == "still":
        for i, tg in enumerate(sys.argv[3:]):
            still(float(tg), f"{sys.argv[2]}_{i}.png")
    else:
        render(sys.argv[1])
