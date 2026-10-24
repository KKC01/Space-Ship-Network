"""SYN Flood 解説 縦型ショート (1080x1920) ジェネレータ"""
import math
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
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
TXT = (241, 245, 249)
DIM = (148, 163, 184)
C_SYN = (56, 189, 248)
C_SYNACK = (167, 139, 250)
C_ACK = (74, 222, 128)
C_ATK = (248, 113, 113)
C_WARN = (250, 204, 21)
C_COOKIE = (251, 146, 60)


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def mix(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def tc(d, xy, s, font, fill, **kw):
    d.text(xy, s, font=font, fill=fill, anchor="mm", **kw)


# ============ メインパネル (上半分) ============
MX0, MY0, MX1, MY1 = 30, 150, 1050, 1000
NP = {
    "client": (230, 330),
    "attacker": (230, 820),
    "server": (810, 560),
    "cloud": (540, 905),
}
N_SLOTS = 8


def edge_points(src, dst):
    (x0, y0), (x1, y1) = NP[src], NP[dst]
    dx, dy = x1 - x0, y1 - y0
    dd = math.hypot(dx, dy)
    ux, uy = dx / dd, dy / dd
    o0 = 75 if src == "cloud" else 125
    o1 = 75 if dst == "cloud" else 125
    return (x0 + ux * o0, y0 + uy * o0), (x1 - ux * o1, y1 - uy * o1)


def node(d, key, name, sub, state, color, alpha=1.0):
    if alpha <= 0:
        return
    x, y = NP[key]
    d.rounded_rectangle((x - 125, y - 58, x + 125, y + 58), 18,
                        fill=mix(BG, PANEL, alpha), outline=mix(BG, color, alpha), width=5)
    tc(d, (x, y - 18), name, f(38), mix(BG, TXT, alpha))
    tc(d, (x, y + 24), sub, f(24, True), mix(BG, DIM, alpha))
    if state:
        s, sc = state
        tc(d, (x, y + 88), s, f(30), mix(BG, sc, alpha))


def cloud(d, alpha=1.0):
    if alpha <= 0:
        return
    x, y = NP["cloud"]
    c = mix(BG, (71, 85, 105), alpha)
    for dx, dy, r in [(-80, 6, 40), (-30, -18, 50), (34, -12, 46), (84, 8, 38), (0, 18, 46)]:
        d.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=c)
    tc(d, (x, y - 4), "偽装された送信元IP", f(26), mix(BG, TXT, alpha))
    tc(d, (x, y + 30), "(存在しない/応答しない)", f(20), mix(BG, DIM, alpha))


def packet(d, pk, t):
    t0, t1 = pk["t0"], pk["t1"]
    if t < t0:
        return
    a, b = edge_points(pk["src"], pk["dst"])
    col = pk["color"]
    if t <= t1:
        d.line((a, b), fill=mix(BG, col, 0.35), width=3)
        p = ease((t - t0) / (t1 - t0))
        x, y = lerp(a[0], b[0], p), lerp(a[1], b[1], p)
        fade = clamp((1 - p) / 0.25) if pk.get("lost") else 1.0
        label = pk["label"]
        tw = d.textlength(label, font=f(28)) + 28
        d.rounded_rectangle((x - tw / 2, y - 24, x + tw / 2, y + 24), 12,
                            fill=mix(BG, col, 0.92 * fade), outline=mix(BG, (255, 255, 255), 0.7 * fade), width=2)
        tc(d, (x, y), label, f(28), mix(BG, (10, 15, 25), fade))
    elif pk.get("drop") and t < t1 + 1.0:
        x, y = b
        c = mix(BG, C_ATK, 1 - (t - t1))
        d.line((x - 24, y - 24, x + 24, y + 24), fill=c, width=8)
        d.line((x - 24, y + 24, x + 24, y - 24), fill=c, width=8)
        tc(d, (x, y - 44), "破棄", f(28), c)
    elif pk.get("lost") and t < t1 + 0.8:
        x, y = b
        tc(d, (x + 26, y - 26), "?", f(44), mix(BG, DIM, 1 - (t - t1) / 0.8))


def mini_backlog(d, used, color, t):
    """サーバの下に 8 マスのバックログ表示"""
    x, y = NP["server"]
    y += 128
    cw, gap = 26, 6
    x0 = x - (N_SLOTS * (cw + gap) - gap) / 2
    for i in range(N_SLOTS):
        cx = x0 + i * (cw + gap)
        box = (cx, y, cx + cw, y + 34)
        if i < used:
            d.rounded_rectangle(box, 5, fill=color)
        else:
            d.rounded_rectangle(box, 5, outline=LINE, width=2)
    tc(d, (x, y + 58), f"バックログ {used}/{N_SLOTS}", f(24), color if used else DIM)


def mk(t0, dt, src, dst, label, color, **kw):
    pk = dict(t0=t0, t1=t0 + dt, src=src, dst=dst, label=label, color=color)
    pk.update(kw)
    return pk


# ---- 正常系 (シーン2〜3、ローカル時刻 tn) ----
NORMAL_PK = [
    mk(0.5, 1.2, "client", "server", "SYN", C_SYN),
    mk(2.3, 1.2, "server", "client", "SYN-ACK", C_SYNACK),
    mk(4.3, 1.2, "client", "server", "ACK", C_ACK),
]


def draw_normal(d, tn):
    def st(seq):
        cur = seq[0][1:]
        for ts, s, c in seq:
            if tn >= ts:
                cur = (s, c)
        return cur

    node(d, "client", "あなたのPC", "192.0.2.10",
         st([(0, "CLOSED", DIM), (0.5, "SYN_SENT", C_SYN), (4.3, "ESTABLISHED", C_ACK)]), C_SYN)
    node(d, "server", "Webサーバ", "198.51.100.1",
         st([(0, "LISTEN", DIM), (1.7, "SYN_RCVD", C_WARN), (5.5, "ESTABLISHED", C_ACK)]), DIM)
    for pk in NORMAL_PK:
        packet(d, pk, tn)
    used = 1 if 1.7 <= tn < 7.0 else 0
    mini_backlog(d, used, C_ACK if tn >= 5.5 else C_WARN, tn)


# ---- 攻撃系 (シーン4〜6、ローカル時刻 tf) ----
def build_flood():
    pk, arrivals = [], []
    for i in range(14):
        t0 = 0.3 + i * 0.9
        arr = t0 + 0.7
        if i < N_SLOTS:
            pk.append(mk(t0, 0.7, "attacker", "server", "SYN", C_ATK))
            arrivals.append(arr)
            pk.append(mk(arr + 0.1, 0.8, "server", "cloud", "SYN-ACK", C_SYNACK, lost=True))
        else:
            pk.append(mk(t0, 0.7, "attacker", "server", "SYN", C_ATK, drop=True))
    pk.append(mk(11.4, 0.9, "client", "server", "SYN", C_SYN, drop=True))
    pk.append(mk(13.6, 0.9, "client", "server", "SYN(再送)", C_SYN, drop=True))
    return pk, arrivals


FLOOD_PK, FLOOD_ARR = build_flood()
FLOOD_DUR = 16.0


def flood_count(tf):
    return sum(1 for a in FLOOD_ARR if tf >= a)


def draw_flood(d, tf, show_client=True):
    n = flood_count(tf)
    full = n >= N_SLOTS
    node(d, "attacker", "攻撃者", "送信元IPを偽装", ("SYN を連射", C_ATK), C_ATK)
    cloud(d)
    if show_client:
        a = clamp((tf - 10.0) / 0.6)
        state = None
        for ts, s, c in [(10.0, "接続したい…", C_SYN), (12.3, "応答なし", C_ATK), (14.5, "接続できない!", C_ATK)]:
            if tf >= ts:
                state = (s, c)
        node(d, "client", "正規ユーザー", "192.0.2.10", state, C_SYN, a)
    srv = ("LISTEN", DIM)
    if n:
        srv = (f"SYN_RCVD ×{n}", C_WARN)
    if full:
        srv = ("満杯!", C_ATK)
    node(d, "server", "Webサーバ", "198.51.100.1", srv, C_ATK if full else DIM)
    for pk in FLOOD_PK:
        packet(d, pk, tf)
    mini_backlog(d, n, C_ATK, tf)


# ---- SYN Cookie (シーン8、ローカル時刻 tk) ----
def build_cookie():
    pk = []
    for i in range(6):
        t0 = 0.2 + i * 0.6
        pk.append(mk(t0, 0.7, "attacker", "server", "SYN", C_ATK))
        pk.append(mk(t0 + 0.8, 0.8, "server", "cloud", "SYN-ACK(Cookie)", C_COOKIE, lost=True))
    pk.append(mk(1.6, 0.9, "client", "server", "SYN", C_SYN))
    pk.append(mk(2.7, 0.9, "server", "client", "SYN-ACK(Cookie)", C_COOKIE))
    pk.append(mk(3.8, 0.9, "client", "server", "ACK(Cookie+1)", C_ACK))
    return pk


COOKIE_PK = build_cookie()


def draw_cookie(d, tk):
    node(d, "attacker", "攻撃者", "送信元IPを偽装", ("SYN を連射", C_ATK), C_ATK)
    cloud(d)
    cs = ("SYN_SENT", C_SYN) if tk >= 1.6 else ("CLOSED", DIM)
    if tk >= 4.7:
        cs = ("接続OK!", C_ACK)
    node(d, "client", "正規ユーザー", "192.0.2.10", cs, C_SYN)
    srv = ("SYN Cookie 有効", C_COOKIE)
    if tk >= 4.7:
        srv = ("Cookie検証OK ✓", C_ACK)
    node(d, "server", "Webサーバ", "198.51.100.1", srv, C_COOKIE)
    for pk in COOKIE_PK:
        packet(d, pk, tk)
    mini_backlog(d, 1 if tk >= 4.7 else 0, C_ACK, tk)


# ---- 時系列グラフ (シーン7) ----
def draw_graph(d, p, x0, y0, x1, y1, big=True):
    """半開接続数の推移を p(0..1) まで描く"""
    fs = 26 if big else 20
    tc(d, ((x0 + x1) / 2, y0 + 10), "半開接続数(SYN_RCVD)の推移", f(fs + 6), TXT)
    gx0, gy0, gx1, gy1 = x0 + 70, y0 + 70, x1 - 30, y1 - 60
    d.line((gx0, gy1, gx1, gy1), fill=LINE, width=3)
    d.line((gx0, gy0, gx0, gy1), fill=LINE, width=3)
    d.line((gx0, gy0, gx1, gy0), fill=mix(BG, C_ATK, 0.6), width=2)
    d.text((gx0 - 12, gy0), str(N_SLOTS), font=f(fs), fill=C_ATK, anchor="rm")
    d.text((gx0 - 12, gy1), "0", font=f(fs), fill=DIM, anchor="rm")
    d.text((gx1, gy0 - 22), "上限(バックログ)", font=f(fs - 4), fill=C_ATK, anchor="rm")
    for s in range(0, int(FLOOD_DUR) + 1, 4):
        sx = gx0 + (gx1 - gx0) * s / FLOOD_DUR
        tc(d, (sx, gy1 + 28), f"{s}s", f(fs - 4), DIM)
    tmax = FLOOD_DUR * p
    pts = []
    for k in range(321):
        tt = FLOOD_DUR * k / 320
        if tt > tmax:
            break
        pts.append((gx0 + (gx1 - gx0) * tt / FLOOD_DUR, gy1 - (gy1 - gy0) * flood_count(tt) / N_SLOTS))
    if len(pts) > 1:
        d.line(pts, fill=C_WARN, width=6)
    marks = [(0.3, "攻撃開始", C_ATK, 0.25), (FLOOD_ARR[-1], "満杯", C_ATK, 0.45), (11.4, "正規SYN破棄", C_SYN, 0.7)]
    for tt, label, c, ly in marks:
        if tt > tmax:
            continue
        mx = gx0 + (gx1 - gx0) * tt / FLOOD_DUR
        d.line((mx, gy0, mx, gy1), fill=mix(BG, c, 0.7), width=2)
        my = gy0 + (gy1 - gy0) * ly
        tw = d.textlength(label, font=f(fs)) + 16
        d.rounded_rectangle((mx + 6, my - 18, mx + 6 + tw, my + 18), 8, fill=mix(BG, c, 0.85))
        d.text((mx + 14, my), label, font=f(fs), fill=(10, 15, 25), anchor="lm")


# ---- 比較表 (シーン9) ----
def draw_compare(d, t):
    tc(d, (540, 230), "対策なし vs SYN Cookie", f(48), TXT)
    rows = [
        ("", "対策なし", "SYN Cookie"),
        ("偽装SYNが来ると", "1件ごとに枠を消費", "枠を消費しない"),
        ("バックログ", "すぐ満杯", "空のまま"),
        ("正規ユーザー", "× 接続できない", "○ 接続できる"),
    ]
    xs = [60, 380, 720]
    ws = [320, 340, 300]
    for r, row in enumerate(rows):
        a = clamp((t - 0.3 - r * 0.5) / 0.4)
        y = 300 + r * 130
        for c, cell in enumerate(row):
            if r == 0 and c == 0:
                continue
            col = PANEL
            fg = TXT
            if r == 0:
                col = mix(BG, C_ATK if c == 1 else C_ACK, 0.6)
            elif c == 1:
                fg = C_ATK
            elif c == 2:
                fg = C_ACK
            d.rounded_rectangle((xs[c], y, xs[c] + ws[c] - 10, y + 115), 14,
                                fill=mix(BG, col, a), outline=mix(BG, LINE, a), width=2)
            tc(d, (xs[c] + (ws[c] - 10) / 2, y + 57), cell, f(32 if r else 36), mix(BG, fg, a))
    a = clamp((t - 2.6) / 0.5)
    tc(d, (540, 870), "ほかにも：バックログ拡大・SYN-ACK再送回数の削減", f(30), mix(BG, DIM, a))
    tc(d, (540, 920), "レート制限・上流でのDDoS防御", f(30), mix(BG, DIM, a))


def draw_shield(d, t):
    x, y = 540, 560
    a = ease(t / 0.8)
    r = 240 * (0.8 + 0.2 * a)
    pts = [(x, y - r), (x + r * 0.85, y - r * 0.6), (x + r * 0.75, y + r * 0.35), (x, y + r),
           (x - r * 0.75, y + r * 0.35), (x - r * 0.85, y - r * 0.6)]
    d.polygon(pts, fill=mix(BG, (22, 101, 52), a), outline=mix(BG, C_ACK, a))
    d.line(pts + [pts[0]], fill=mix(BG, C_ACK, a), width=8)
    tc(d, (x, y - 40), "SYN Flood", f(56), mix(BG, TXT, a))
    tc(d, (x, y + 40), "仕組みを知って防ぐ", f(40), mix(BG, C_ACK, a))


# ============ 下段左のサブパネル ============
SX0, SY0, SX1, SY1 = 30, 1420, 530, 1890


def sub_panel(d, kind, t, gt):
    d.rounded_rectangle((SX0, SY0, SX1, SY1), 24, fill=PANEL, outline=LINE, width=3)
    cx, cy = (SX0 + SX1) / 2, (SY0 + SY1) / 2
    if kind == "server_x":
        # サーバのアイコン + ✕
        for i in range(3):
            y = cy - 120 + i * 85
            d.rounded_rectangle((cx - 130, y, cx + 130, y + 70), 12, fill=(51, 65, 85), outline=DIM, width=3)
            d.ellipse((cx + 90, y + 27, cx + 106, y + 43), fill=C_ACK if t < 1.5 else C_ATK)
            for k in range(3):
                d.line((cx - 105, y + 22 + k * 13, cx + 20, y + 22 + k * 13), fill=DIM, width=3)
        a = ease((t - 1.5) / 0.4)
        if a > 0:
            s = 170 * a
            d.line((cx - s, cy - s, cx + s, cy + s), fill=C_ATK, width=22)
            d.line((cx - s, cy + s, cx + s, cy - s), fill=C_ATK, width=22)
        tc(d, (cx, SY1 - 50), "つながらない…", f(36), C_ATK if a > 0 else DIM)
    elif kind == "steps":
        tc(d, (cx, SY0 + 60), "3ウェイハンドシェイク", f(34), TXT)
        for i, (lab, c, who) in enumerate([("SYN", C_SYN, "PC → サーバ"), ("SYN-ACK", C_SYNACK, "サーバ → PC"),
                                           ("ACK", C_ACK, "PC → サーバ")]):
            a = clamp((gt - 0.5 - i * 1.9) / 0.4)
            y = SY0 + 150 + i * 105
            d.rounded_rectangle((SX0 + 40, y - 38, SX0 + 230, y + 38), 14, fill=mix(PANEL, c, a))
            tc(d, (SX0 + 135, y), lab, f(32), mix(PANEL, (10, 15, 25), a))
            d.text((SX0 + 250, y), who, font=f(28), fill=mix(PANEL, TXT, a), anchor="lm")
    elif kind == "meter":
        n = flood_count(gt)
        tc(d, (cx, SY0 + 55), "SYNバックログ", f(34), TXT)
        cw, ch, gap = 92, 80, 18
        x0 = cx - (4 * cw + 3 * gap) / 2
        for i in range(N_SLOTS):
            r, c = divmod(i, 4)
            bx, by = x0 + c * (cw + gap), SY0 + 110 + r * (ch + gap)
            if i < n:
                d.rounded_rectangle((bx, by, bx + cw, by + ch), 12, fill=C_ATK)
                tc(d, (bx + cw / 2, by + ch / 2), "半開", f(26), (40, 10, 10))
            else:
                d.rounded_rectangle((bx, by, bx + cw, by + ch), 12, outline=LINE, width=3)
        full = n >= N_SLOTS
        col = C_ATK if full else C_WARN
        if full and int(gt * 4) % 2 == 0:
            col = TXT
        tc(d, (cx, SY1 - 110), f"{n} / {N_SLOTS}", f(64, True), col)
        tc(d, (cx, SY1 - 45), "満杯 → 新しいSYNは破棄" if full else "ACK待ちのまま埋まっていく", f(28), C_ATK if full else DIM)
    elif kind == "timeout":
        r = 110
        x, y = cx, SY0 + 170
        d.ellipse((x - r, y - r, x + r, y + r), outline=C_WARN, width=10)
        ang = -math.pi / 2 + t * 1.2
        d.line((x, y, x + 80 * math.cos(ang), y + 80 * math.sin(ang)), fill=C_WARN, width=10)
        d.line((x, y, x, y - 55), fill=C_WARN, width=10)
        tc(d, (cx, SY0 + 340), "タイムアウトまで", f(34), TXT)
        tc(d, (cx, SY0 + 390), "約60秒は解放されない", f(34), C_WARN)
        tc(d, (cx, SY0 + 435), "(Linux既定の場合)", f(24), DIM)
    elif kind == "cookie_meter":
        tc(d, (cx, SY0 + 55), "SYNバックログ", f(34), TXT)
        cw, ch, gap = 92, 80, 18
        x0 = cx - (4 * cw + 3 * gap) / 2
        for i in range(N_SLOTS):
            r, c = divmod(i, 4)
            bx, by = x0 + c * (cw + gap), SY0 + 110 + r * (ch + gap)
            d.rounded_rectangle((bx, by, bx + cw, by + ch), 12, outline=mix(PANEL, C_ACK, 0.5), width=3)
        tc(d, (cx, SY1 - 110), f"0 / {N_SLOTS}", f(64, True), C_ACK)
        tc(d, (cx, SY1 - 45), "偽装SYNでは枠が埋まらない", f(28), C_ACK)
    elif kind == "measures":
        tc(d, (cx, SY0 + 55), "そのほかの対策", f(34), TXT)
        for i, s in enumerate(["バックログ拡大", "SYN-ACK再送の削減", "レート制限", "上流でDDoS防御"]):
            a = clamp((t - 0.4 - i * 0.5) / 0.4)
            y = SY0 + 140 + i * 82
            d.rounded_rectangle((SX0 + 40, y - 32, SX1 - 40, y + 32), 14, fill=mix(PANEL, (30, 58, 138), a))
            d.text((SX0 + 70, y), s, font=f(30), fill=mix(PANEL, TXT, a), anchor="lm")
    elif kind == "final":
        for i, s in enumerate(["ACK待ちの枠を埋める攻撃", "正規ユーザーが接続不可に", "SYN Cookieなどで対策"]):
            a = clamp((t - 0.3 - i * 0.5) / 0.4)
            y = SY0 + 110 + i * 120
            check(d, SX0 + 70, y, 46, mix(PANEL, C_ACK, a))
            d.text((SX0 + 115, y), s, font=f(32), fill=mix(PANEL, TXT, a), anchor="lm")


def check(d, x, y, s, col):
    d.rounded_rectangle((x - s / 2, y - s / 2, x + s / 2, y + s / 2), 8, outline=col, width=4)
    d.line((x - s * 0.28, y, x - s * 0.06, y + s * 0.24, x + s * 0.32, y - s * 0.26), fill=col, width=6)


# ============ キャラクター枠 (下段右) ============
CX0, CY0, CX1, CY1 = 550, 1420, 1050, 1890


def char_slot(d, expr, t):
    # 破線の枠
    col = (100, 116, 139)
    step = 24
    for x in range(CX0, CX1, step):
        d.line((x, CY0, min(x + 12, CX1), CY0), fill=col, width=3)
        d.line((x, CY1, min(x + 12, CX1), CY1), fill=col, width=3)
    for y in range(CY0, CY1, step):
        d.line((CX0, y, CX0, min(y + 12, CY1)), fill=col, width=3)
        d.line((CX1, y, CX1, min(y + 12, CY1)), fill=col, width=3)
    bob = 6 * math.sin(t * 3)
    cx = (CX0 + CX1) / 2
    sil = (51, 65, 85)
    d.ellipse((cx - 85, CY0 + 60 + bob, cx + 85, CY0 + 230 + bob), fill=sil)
    d.rounded_rectangle((cx - 150, CY0 + 245 + bob, cx + 150, CY1 - 4), 60, fill=sil)
    tc(d, (cx, CY0 + 330), "キャラクター枠", f(36), DIM)
    tc(d, (cx, CY0 + 380), "（後で差し替え）", f(26), DIM)
    tw = d.textlength(f"表情: {expr}", font=f(28)) + 30
    d.rounded_rectangle((cx - tw / 2, CY1 - 70, cx + tw / 2, CY1 - 24), 22, fill=(30, 41, 59), outline=col, width=2)
    tc(d, (cx, CY1 - 47), f"表情: {expr}", f(28), TXT)


# ============ 字幕・チェックリスト (中段) ============
def subtitle(d, text, t):
    a = ease(t / 0.25)
    dy = (1 - a) * 30
    lines = text.split("\n")
    for i, line in enumerate(lines):
        y = 1080 + i * 74 - (len(lines) - 1) * 37 + dy
        segs = line.split("*")
        font = f(58)
        total = sum(d.textlength(s, font=font) for s in segs)
        x = W / 2 - total / 2
        for k, s in enumerate(segs):
            col = C_WARN if k % 2 else TXT
            d.text((x, y), s, font=font, fill=mix(BG, col, a), anchor="lm",
                   stroke_width=6, stroke_fill=(0, 0, 0))
            x += d.textlength(s, font=font)


def checklist(d, items, t):
    if not items:
        return
    x0, y0 = 90, 1185
    h = 60 * len(items) + 24
    a = ease(t / 0.3)
    d.rounded_rectangle((x0, y0, W - x0, y0 + h), 20, fill=mix(BG, (30, 41, 59), a), outline=mix(BG, LINE, a), width=3)
    for i, s in enumerate(items):
        k = clamp((t - 0.3 - i * 0.6) / 0.3)
        y = y0 + 42 + i * 60
        check(d, x0 + 50, y, 40, mix((30, 41, 59), C_ACK, k))
        d.text((x0 + 90, y), s, font=f(34), fill=mix((30, 41, 59), TXT, k), anchor="lm")


# ============ ヘッダ ============
def header(d, idx, tg, total):
    d.rectangle((0, 0, W, 135), fill=PANEL)
    n = len(SCENES)
    sw = (W - 60 - (n - 1) * 8) / n
    for i in range(n):
        x = 30 + i * (sw + 8)
        d.rounded_rectangle((x, 22, x + sw, 32), 5, fill=C_WARN if i <= idx else LINE)
    tc(d, (W / 2, 85), "SYN Flood 攻撃のしくみ", f(46), TXT)


# ============ シーン ============
# (長さ, 字幕, チェックリスト, メイン描画, 下段左, キャラ表情)
SCENES = [
    (5.0, "サーバーが急につながらない…\nその原因、*SYN Flood* かも！", None,
     lambda d, t: draw_flood(d, 6.0 + t * 1.6), "server_x", "驚き"),
    (5.0, "まずは*正常なTCP接続*から", None,
     lambda d, t: draw_normal(d, t), "steps", "説明"),
    (5.0, "ACKが届くまで、サーバーは\n*「枠」を1つ確保して待つ*",
     ["① SYN：接続したい", "② SYN-ACK：枠を確保して返答", "③ ACK：接続確立 → 枠を解放"],
     lambda d, t: draw_normal(d, 5.0 + t * 0.6), "steps", "指さし"),
    (6.0, "攻撃者は*送信元IPを偽装*して\nSYNを大量に送りつける", None,
     lambda d, t: draw_flood(d, t), "meter", "真剣"),
    (5.0, "SYN-ACKは偽装IP宛て…\n*誰もACKを返さない*", None,
     lambda d, t: draw_flood(d, 6.0 + t), "meter", "困り顔"),
    (5.0, "枠が満杯 → *正規ユーザーも*\n*接続できない*＝DoS", None,
     lambda d, t: draw_flood(d, 11.0 + t), "meter", "焦り"),
    (5.0, "時系列で見ると\n*半開接続が一気に埋まる*", None,
     lambda d, t: draw_graph(d, ease(t / 3.5), MX0 + 20, MY0 + 60, MX1 - 20, MY1 - 20), "timeout", "説明"),
    (6.0, "対策：*SYN Cookie*\nSYNを受けても枠を確保しない",
     ["接続情報をシーケンス番号に埋め込む", "ACKのCookieを検証してから確立"],
     lambda d, t: draw_cookie(d, t), "cookie_meter", "笑顔"),
    (5.0, "対策ありなしで比べると…", None,
     lambda d, t: draw_compare(d, t), "measures", "楽しそう"),
    (5.0, "仕組みを知って\n*正しく守ろう！*", None,
     lambda d, t: draw_shield(d, t), "final", "手を振る"),
]


def frame(tg):
    acc = 0.0
    for idx, (dur, sub, items, main, kind, expr) in enumerate(SCENES):
        if tg < acc + dur or idx == len(SCENES) - 1:
            t = tg - acc
            img = Image.new("RGB", (W, H), BG)
            d = ImageDraw.Draw(img)
            d.rounded_rectangle((MX0, MY0, MX1, MY1), 28, fill=(15, 23, 42), outline=LINE, width=3)
            main(d, t)
            header(d, idx, tg, None)
            subtitle(d, sub, t)
            checklist(d, items, t)
            gt = {1: t, 2: 5.0 + t, 3: t, 4: 6.0 + t, 5: 11.0 + t}.get(idx, t)
            sub_panel(d, kind, t, gt)
            char_slot(d, expr, tg)
            return img
        acc += dur


def total_dur():
    return sum(s[0] for s in SCENES)


def render(out):
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
         "-preset", "medium", "-movflags", "+faststart", out],
        stdin=subprocess.PIPE)
    n = int(total_dur() * FPS)
    for k in range(n):
        tg = k / FPS
        img = frame(tg)
        fade = min(clamp(tg / 0.3), clamp((total_dur() - tg) / 0.4))
        if fade < 1:
            img = Image.blend(Image.new("RGB", (W, H)), img, fade)
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"done: {out} ({total_dur():.1f}s)")


if __name__ == "__main__":
    if sys.argv[1] == "still":
        for i, tg in enumerate(sys.argv[3:]):
            frame(float(tg)).save(f"{sys.argv[2]}_{i}.png")
    else:
        render(sys.argv[1])
