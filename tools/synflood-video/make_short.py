"""SYN Flood 解説 縦型ショート (1080x1920) ジェネレータ

画面構成 (参考: 解説系ショート):
  上段   0-600   : ネットワークのアニメーション (暗い画面)
  中段 600-1260  : クリーム色の背景に、黒フチのカードで流れを図解
  下段 1260-1920 : 黄色の帯 + 字幕ボックス + キャラクター枠
"""
import math
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from fonts import FONT, MONO

W, H, FPS = 1080, 1920, 30
_fc = {}


def f(size, mono=False):
    key = (size, mono)
    if key not in _fc:
        _fc[key] = ImageFont.truetype(MONO if mono else FONT, size)
    return _fc[key]


BG = (238, 242, 255)
PANEL = (255, 255, 255)
LINE = (176, 188, 206)
TXT = (15, 23, 42)
DIM = (100, 116, 139)
C_SYN = (14, 165, 233)
C_SYNACK = (139, 92, 246)
C_ACK = (16, 185, 129)
C_ATK = (244, 63, 94)
C_WARN = (245, 158, 11)
C_COOKIE = (249, 115, 22)
C_INDIGO = (99, 102, 241)
ON_COLOR = (255, 255, 255)

CREAM = (247, 242, 230)
INK = (20, 22, 30)
YELLOW = (255, 214, 51)
RED = (229, 57, 53)
MINT = (190, 242, 214)
NAVY = (16, 20, 38)

TOP_H = 850
MID_Y0, MID_Y1 = 850, 1260


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


# ======================================================================
# 上段: ネットワークのアニメーション
# 1350x1062 で描いて 0.8 倍に縮小し、1080x850 に収める
# 柔らかいグラデーション背景 + 影付きの白カード + 光るパケット
# ======================================================================
SW, SH = 1350, 1062
NP = {
    "client": (240, 300),
    "attacker": (240, 800),
    "server": (1100, 470),
    "cloud": (690, 120),
}
CARD_HW, CARD_HH = 165, 128
N_SLOTS = 8
CUR = {"img": None}  # 描画中の上段キャンバス (影やグローの合成に使う)
_cache = {}


def shadow_card(w, h, r=34, blur=22, alpha=60):
    key = ("card", w, h, r)
    if key not in _cache:
        pad = blur * 3
        im = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((pad, pad + 14, pad + w, pad + h + 14), r, fill=(40, 50, 110, alpha))
        im = im.filter(ImageFilter.GaussianBlur(blur))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((pad, pad, pad + w, pad + h), r, fill=(255, 255, 255, 240),
                            outline=(255, 255, 255, 255), width=3)
        _cache[key] = (im, pad)
    return _cache[key]


def top_background():
    if "bg" not in _cache:
        g = Image.new("RGB", (2, 2))
        g.putdata([(238, 242, 255), (224, 242, 254), (243, 232, 255), (236, 253, 245)])
        bg = g.resize((SW, SH), Image.BICUBIC)
        blobs = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        bd = ImageDraw.Draw(blobs)
        for (x, y, r, c) in [(150, 120, 260, (167, 139, 250, 90)), (1250, 260, 300, (56, 189, 248, 80)),
                             (1150, 980, 320, (244, 114, 182, 70)), (120, 1000, 260, (52, 211, 153, 70))]:
            bd.ellipse((x - r, y - r, x + r, y + r), fill=c)
        blobs = blobs.filter(ImageFilter.GaussianBlur(120))
        bg.paste(blobs, (0, 0), blobs)
        dots = ImageDraw.Draw(bg)
        for y in range(20, SH, 40):
            for x in range(20, SW, 40):
                dots.ellipse((x - 1.5, y - 1.5, x + 1.5, y + 1.5), fill=(203, 213, 235))
        _cache["bg"] = bg
    return _cache["bg"].copy()


# ---- アイコン ----
def icon_laptop(d, x, y, c):
    d.rounded_rectangle((x - 58, y - 44, x + 58, y + 28), 10, fill=c)
    d.rounded_rectangle((x - 48, y - 35, x + 48, y + 20), 6, fill=(224, 242, 254))
    d.polygon([(x - 74, y + 34), (x + 74, y + 34), (x + 64, y + 46), (x - 64, y + 46)], fill=c)


def icon_server(d, x, y, c):
    for i in range(3):
        yy = y - 48 + i * 33
        d.rounded_rectangle((x - 54, yy, x + 54, yy + 27), 7, fill=c)
        d.ellipse((x + 30, yy + 9, x + 40, yy + 19), fill=(134, 239, 172))
        d.line((x - 40, yy + 13, x + 10, yy + 13), fill=(226, 232, 240), width=4)


def icon_hacker(d, x, y, c):
    d.ellipse((x - 52, y - 54, x + 52, y + 50), fill=c)
    d.pieslice((x - 80, y + 10, x + 80, y + 120), 180, 360, fill=c)
    d.ellipse((x - 34, y - 30, x + 34, y + 36), fill=(30, 27, 46))
    d.ellipse((x - 22, y - 6, x - 8, y + 6), fill=(251, 113, 133))
    d.ellipse((x + 8, y - 6, x + 22, y + 6), fill=(251, 113, 133))


ICONS = {"laptop": icon_laptop, "server": icon_server, "hacker": icon_hacker}


def pill(d, cx, cy, text, bg, size=40, fg=ON_COLOR):
    tw = d.textlength(text, font=f(size)) + 44
    h = size + 26
    d.rounded_rectangle((cx - tw / 2, cy - h / 2, cx + tw / 2, cy + h / 2), h / 2, fill=bg)
    tc(d, (cx, cy), text, f(size), fg, stroke_width=1, stroke_fill=fg)


def node(d, key, name, sub, state, color, alpha=1.0, icon="laptop"):
    if alpha <= 0:
        return
    x, y = NP[key]
    im, pad = shadow_card(CARD_HW * 2, CARD_HH * 2)
    if alpha < 1:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    CUR["img"].paste(im, (int(x - CARD_HW - pad), int(y - CARD_HH - pad)), im)
    d.rounded_rectangle((x - CARD_HW, y - CARD_HH, x + CARD_HW, y - CARD_HH + 10), 5,
                        fill=mix((255, 255, 255), color, alpha))
    ICONS[icon](d, x, y - 40, mix((255, 255, 255), color, alpha))
    tc(d, (x, y + 52), name, f(48), mix((255, 255, 255), TXT, alpha), stroke_width=1,
       stroke_fill=mix((255, 255, 255), TXT, alpha))
    tc(d, (x, y + 98), sub, f(28, True), mix((255, 255, 255), DIM, alpha))
    if state:
        s, sc = state
        pill(d, x, y + CARD_HH + 50, s, mix(BG, sc, alpha), 38)


def cloud(d, alpha=1.0):
    x, y = NP["cloud"]
    if "cloud" not in _cache:
        lay = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        for dx, dy, r in [(-130, 14, 58), (-50, -22, 76), (52, -14, 68), (135, 14, 56), (0, 34, 68)]:
            ld.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=(255, 255, 255, 255))
        sh = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        sh.paste((60, 70, 130, 70), (0, 14), lay)
        sh = sh.filter(ImageFilter.GaussianBlur(20))
        sh.alpha_composite(lay)
        _cache["cloud"] = sh
    CUR["img"].paste(_cache["cloud"], (0, 0), _cache["cloud"])
    tc(d, (x, y - 14), "偽装された送信元IP", f(40), TXT, stroke_width=1, stroke_fill=TXT)
    tc(d, (x, y + 30), "存在しない / 応答しない", f(28), DIM)


def edge_points(src, dst):
    (x0, y0), (x1, y1) = NP[src], NP[dst]
    dx, dy = x1 - x0, y1 - y0
    dd = math.hypot(dx, dy)
    ux, uy = dx / dd, dy / dd

    def off(k):
        if k == "cloud":
            return 120
        return min(CARD_HW / max(abs(ux), 1e-6), CARD_HH / max(abs(uy), 1e-6)) + 20

    o0, o1 = off(src), off(dst)
    return (x0 + ux * o0, y0 + uy * o0), (x1 - ux * o1, y1 - uy * o1)


def bez(a, b, p, bend=0.12):
    """2点間をゆるくカーブさせた経路"""
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    nx, ny = -(b[1] - a[1]) * bend, (b[0] - a[0]) * bend
    cx, cy = mx + nx, my + ny
    q = 1 - p
    return (q * q * a[0] + 2 * q * p * cx + p * p * b[0], q * q * a[1] + 2 * q * p * cy + p * p * b[1])


def packet(d, pk, t):
    t0, t1 = pk["t0"], pk["t1"]
    if t < t0:
        return
    a, b = edge_points(pk["src"], pk["dst"])
    col = pk["color"]
    if t <= t1:
        # 点線の経路
        for k in range(0, 40):
            if k % 2 == 0:
                d.line((bez(a, b, k / 40), bez(a, b, (k + 1) / 40)), fill=mix(BG, col, 0.45), width=4)
        p = ease((t - t0) / (t1 - t0))
        fade = clamp((1 - p) / 0.25) if pk.get("lost") else 1.0
        x, y = bez(a, b, p)
        for j in range(1, 6):
            tx, ty = bez(a, b, max(0.0, p - j * 0.035))
            r = 12 - j * 1.8
            d.ellipse((tx - r, ty - r, tx + r, ty + r), fill=mix(BG, col, (0.7 - j * 0.12) * fade))
        label = pk["label"]
        tw = d.textlength(label, font=f(44)) + 46
        glow = Image.new("RGBA", (int(tw) + 120, 190), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.rounded_rectangle((60, 60, 60 + tw, 130), 35, fill=col + (int(170 * fade),))
        glow = glow.filter(ImageFilter.GaussianBlur(18))
        CUR["img"].paste(glow, (int(x - tw / 2 - 60), int(y - 95)), glow)
        d.rounded_rectangle((x - tw / 2, y - 35, x + tw / 2, y + 35), 35, fill=mix(BG, col, fade))
        tc(d, (x, y), label, f(44), mix(BG, ON_COLOR, fade), stroke_width=1, stroke_fill=mix(BG, ON_COLOR, fade))
    elif pk.get("drop") and t < t1 + 1.0:
        x, y = b
        k = 1 - (t - t1)
        c = mix(BG, C_ATK, k)
        d.ellipse((x - 40, y - 40, x + 40, y + 40), fill=mix(BG, (255, 228, 230), k), outline=c, width=5)
        d.line((x - 18, y - 18, x + 18, y + 18), fill=c, width=9)
        d.line((x - 18, y + 18, x + 18, y - 18), fill=c, width=9)
        pill(d, x, y - 76, "破棄", c, 32)
    elif pk.get("lost") and t < t1 + 0.8:
        x, y = b
        tc(d, (x + 40, y - 46), "?", f(70), mix(BG, DIM, 1 - (t - t1) / 0.8))


def mini_backlog(d, used, color):
    """サーバの下にバックログのマス"""
    x, y = NP["server"]
    y += CARD_HH + 110
    cw, gap = 40, 9
    x0 = x - (N_SLOTS * (cw + gap) - gap) / 2
    for i in range(N_SLOTS):
        cx = x0 + i * (cw + gap)
        box = (cx, y, cx + cw, y + 50)
        if i < used:
            d.rounded_rectangle(box, 10, fill=color)
        else:
            d.rounded_rectangle(box, 10, fill=(255, 255, 255), outline=(203, 213, 225), width=3)
    tc(d, (x, y + 86), f"バックログ {used}/{N_SLOTS}", f(38), color if used else DIM,
       stroke_width=1, stroke_fill=color if used else DIM)


def mk(t0, dt, src, dst, label, color, **kw):
    pk = dict(t0=t0, t1=t0 + dt, src=src, dst=dst, label=label, color=color)
    pk.update(kw)
    return pk


# ---- 正常系 (ローカル時刻 tn) ----
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
         st([(0, "LISTEN", DIM), (1.7, "SYN_RCVD", C_WARN), (5.5, "ESTABLISHED", C_ACK)]), C_INDIGO, icon="server")
    for pk in NORMAL_PK:
        packet(d, pk, tn)
    used = 1 if 1.7 <= tn < 7.0 else 0
    mini_backlog(d, used, C_ACK if tn >= 5.5 else C_WARN)


# ---- 攻撃系 (ローカル時刻 tf) ----
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


def draw_flood(d, tf):
    n = flood_count(tf)
    full = n >= N_SLOTS
    cloud(d)
    node(d, "attacker", "攻撃者", "送信元IPを偽装", ("SYN を連射", C_ATK), C_ATK, icon="hacker")
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
    node(d, "server", "Webサーバ", "198.51.100.1", srv, C_ATK if full else C_INDIGO, icon="server")
    for pk in FLOOD_PK:
        packet(d, pk, tf)
    mini_backlog(d, n, C_ATK)


# ---- SYN Cookie (ローカル時刻 tk) ----
def build_cookie():
    pk = []
    for i in range(6):
        t0 = 0.2 + i * 0.6
        pk.append(mk(t0, 0.7, "attacker", "server", "SYN", C_ATK))
        pk.append(mk(t0 + 0.8, 0.8, "server", "cloud", "SYN-ACK", C_COOKIE, lost=True))
    pk.append(mk(1.6, 0.9, "client", "server", "SYN", C_SYN))
    pk.append(mk(2.7, 0.9, "server", "client", "SYN-ACK+Cookie", C_COOKIE))
    pk.append(mk(3.8, 0.9, "client", "server", "ACK+Cookie", C_ACK))
    return pk


COOKIE_PK = build_cookie()


def draw_cookie(d, tk):
    cloud(d)
    node(d, "attacker", "攻撃者", "送信元IPを偽装", ("SYN を連射", C_ATK), C_ATK, icon="hacker")
    cs = ("SYN_SENT", C_SYN) if tk >= 1.6 else ("CLOSED", DIM)
    if tk >= 4.7:
        cs = ("接続OK!", C_ACK)
    node(d, "client", "正規ユーザー", "192.0.2.10", cs, C_SYN)
    srv = ("SYN Cookie 有効", C_COOKIE)
    if tk >= 4.7:
        srv = ("Cookie検証OK", C_ACK)
    node(d, "server", "Webサーバ", "198.51.100.1", srv, C_COOKIE, icon="server")
    for pk in COOKIE_PK:
        packet(d, pk, tk)
    mini_backlog(d, 1 if tk >= 4.7 else 0, C_ACK)


def glass_panel(x0, y0, x1, y1):
    im, pad = shadow_card(int(x1 - x0), int(y1 - y0), r=40)
    CUR["img"].paste(im, (int(x0 - pad), int(y0 - pad)), im)


# ---- 時系列グラフ ----
def draw_graph(d, p):
    x0, y0, x1, y1 = 40, 40, SW - 40, SH - 40
    glass_panel(x0, y0, x1, y1)
    tc(d, ((x0 + x1) / 2, y0 + 60), "半開接続数の推移", f(56), TXT, stroke_width=1, stroke_fill=TXT)
    gx0, gy0, gx1, gy1 = x0 + 100, y0 + 160, x1 - 50, y1 - 90
    for k in range(N_SLOTS + 1):
        gy = gy1 - (gy1 - gy0) * k / N_SLOTS
        d.line((gx0, gy, gx1, gy), fill=(226, 232, 240), width=2)
    d.line((gx0, gy0, gx1, gy0), fill=C_ATK, width=3)
    d.text((gx0 - 18, gy0), str(N_SLOTS), font=f(40), fill=C_ATK, anchor="rm")
    d.text((gx0 - 18, gy1), "0", font=f(40), fill=DIM, anchor="rm")
    d.text((gx1, gy0 - 30), "上限(バックログ)", font=f(36), fill=C_ATK, anchor="rm")
    for s in range(0, int(FLOOD_DUR) + 1, 4):
        sx = gx0 + (gx1 - gx0) * s / FLOOD_DUR
        tc(d, (sx, gy1 + 42), f"{s}秒", f(36), DIM)
    tmax = FLOOD_DUR * p
    pts = []
    for k in range(321):
        tt = FLOOD_DUR * k / 320
        if tt > tmax:
            break
        pts.append((gx0 + (gx1 - gx0) * tt / FLOOD_DUR, gy1 - (gy1 - gy0) * flood_count(tt) / N_SLOTS))
    if len(pts) > 1:
        d.polygon(pts + [(pts[-1][0], gy1), (gx0, gy1)], fill=(254, 243, 199))
        d.line(pts, fill=C_WARN, width=10, joint="curve")
        ex, ey = pts[-1]
        d.ellipse((ex - 14, ey - 14, ex + 14, ey + 14), fill=C_WARN, outline=(255, 255, 255), width=4)
    marks = [(0.3, "攻撃開始", C_ATK, 0.25), (FLOOD_ARR[-1], "満杯", C_ATK, 0.45), (11.4, "正規SYN破棄", C_SYN, 0.7)]
    for tt, label, c, ly in marks:
        if tt > tmax:
            continue
        mx = gx0 + (gx1 - gx0) * tt / FLOOD_DUR
        d.line((mx, gy0, mx, gy1), fill=mix((255, 255, 255), c, 0.6), width=3)
        tw = d.textlength(label, font=f(40)) + 44
        pill(d, mx + 10 + tw / 2, gy0 + (gy1 - gy0) * ly, label, c, 40)


# ---- 比較表 ----
def draw_compare(d, t):
    glass_panel(30, 40, SW - 30, SH - 40)
    tc(d, (SW / 2, 120), "対策なし vs SYN Cookie", f(62), TXT, stroke_width=1, stroke_fill=TXT)
    rows = [
        ("", "対策なし", "SYN Cookie"),
        ("偽装SYNが来ると", "1件ごとに枠を消費", "枠を消費しない"),
        ("バックログ", "すぐ満杯", "空のまま"),
        ("正規ユーザー", "× 接続できない", "○ 接続できる"),
    ]
    xs = [60, 460, 900]
    ws = [400, 440, 400]
    for r, row in enumerate(rows):
        a = clamp((t - 0.3 - r * 0.5) / 0.4)
        y = 210 + r * 200
        for c, cell in enumerate(row):
            if r == 0 and c == 0:
                continue
            fg = TXT
            fill = (241, 245, 249)
            if r == 0:
                fill, fg = (C_ATK if c == 1 else C_ACK), ON_COLOR
            elif c == 1:
                fill, fg = (255, 241, 242), C_ATK
            elif c == 2:
                fill, fg = (236, 253, 245), C_ACK
            d.rounded_rectangle((xs[c], y, xs[c] + ws[c] - 14, y + 170), 28, fill=mix((255, 255, 255), fill, a))
            tc(d, (xs[c] + (ws[c] - 14) / 2, y + 85), cell, f(44 if r else 52), mix((255, 255, 255), fg, a),
               stroke_width=1, stroke_fill=mix((255, 255, 255), fg, a))


def draw_shield(d, t):
    x, y = SW / 2, SH / 2
    a = ease(t / 0.8)
    r = 340 * (0.8 + 0.2 * a)
    pts = [(x, y - r), (x + r * 0.85, y - r * 0.6), (x + r * 0.75, y + r * 0.35), (x, y + r),
           (x - r * 0.75, y + r * 0.35), (x - r * 0.85, y - r * 0.6)]
    glow = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    ImageDraw.Draw(glow).polygon(pts, fill=(16, 185, 129, int(150 * a)))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    CUR["img"].paste(glow, (0, 0), glow)
    d.polygon(pts, fill=mix(BG, (16, 185, 129), a))
    inner = [(x + (px - x) * 0.86, y + (py - y) * 0.86) for px, py in pts]
    d.line(inner + [inner[0]], fill=mix(BG, (209, 250, 229), a), width=6)
    tc(d, (x, y - 50), "SYN Flood", f(80), mix(BG, ON_COLOR, a), stroke_width=2, stroke_fill=mix(BG, ON_COLOR, a))
    tc(d, (x, y + 50), "仕組みを知って防ぐ", f(52), mix(BG, ON_COLOR, a), stroke_width=1, stroke_fill=mix(BG, ON_COLOR, a))


def draw_top(img, main, t, progress):
    s = top_background()
    CUR["img"] = s
    sd = ImageDraw.Draw(s)
    main(sd, t)
    img.paste(s.resize((W, TOP_H), Image.LANCZOS), (0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 9), fill=(203, 213, 225))
    d.rectangle((0, 0, int(W * progress), 9), fill=(244, 63, 94))


# ======================================================================
# 中段: 黒フチのカードで図解
# ======================================================================
def draw_mid_bg(d):
    d.rectangle((0, MID_Y0, W, MID_Y1), fill=CREAM)
    for y in range(MID_Y0 + 14, MID_Y1, 28):
        for x in range(14, W, 28):
            d.point((x, y), fill=(222, 214, 196))


def bold_text(d, xy, s, font, fill, anchor="mm"):
    d.text(xy, s, font=font, fill=fill, anchor=anchor, stroke_width=1, stroke_fill=fill)


def card_image(w, h, lines, fill, fg, size, sub=None):
    """黒フチ + 右下に影のついたカード画像 (RGBA)"""
    pad = 14
    im = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((pad + 9, pad + 9, pad + w, pad + h), 14, fill=INK + (255,))
    d.rounded_rectangle((pad, pad, pad + w - 9, pad + h - 9), 14, fill=fill + (255,), outline=INK + (255,), width=5)
    cx, cy = pad + (w - 9) / 2, pad + (h - 9) / 2
    if sub:
        cy -= size * 0.35
    n = len(lines)
    for i, s in enumerate(lines):
        y = cy + (i - (n - 1) / 2) * size * 1.2
        bold_text(d, (cx, y), s, f(size), fg)
    if sub:
        bold_text(d, (cx, cy + size * 0.6 * n + 10), sub, f(int(size * 0.55)), INK)
    return im


def paste_card(img, cx, cy, spec, t):
    """spec の出現時刻 at からポップして表示"""
    k = (t - spec["at"]) / 0.28
    if k <= 0:
        return
    # 0.6 倍から少し行き過ぎて 1.0 倍に戻る
    scale = 1.0 if k >= 1 else 0.6 + 0.4 * k + 0.15 * math.sin(k * math.pi)
    im = card_image(spec["w"], spec["h"], spec["lines"], spec.get("fill", (255, 255, 255)),
                    spec.get("fg", INK), spec.get("size", 40), spec.get("sub"))
    if scale != 1.0:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
    im = im.rotate(spec.get("tilt", 0), resample=Image.BICUBIC, expand=True)
    img.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)


def arrow(d, x0, x1, y, a):
    if a <= 0:
        return
    xe = lerp(x0, x1, ease(a))
    d.line((x0, y, xe - 12, y), fill=INK, width=9)
    d.polygon([(xe, y), (xe - 22, y - 17), (xe - 22, y + 17)], fill=INK)


def flow(img, t, cards, y, heading=None):
    """横一列のカードを矢印でつなぐ"""
    d = ImageDraw.Draw(img)
    if heading:
        bold_text(d, (W / 2, y - 125), heading, f(46), INK)
    gap = 56
    total = sum(c["w"] for c in cards) + gap * (len(cards) - 1)
    x = (W - total) / 2
    centers = []
    for i, c in enumerate(cards):
        c.setdefault("at", 0.3 + i * 0.55)
        c.setdefault("tilt", (-1.5, 1.2, -0.8, 1.6)[i % 4])
        centers.append((x + c["w"] / 2, c))
        x += c["w"] + gap
    for i in range(len(centers) - 1):
        (cx0, c0), (cx1, c1) = centers[i], centers[i + 1]
        arrow(d, cx0 + c0["w"] / 2 + 4, cx1 - c1["w"] / 2 - 2, y, (t - c1["at"] + 0.2) / 0.25)
    for cx, c in centers:
        paste_card(img, cx, y, c, t)


def grid(img, t, rows, y0, heading=None):
    d = ImageDraw.Draw(img)
    if heading:
        bold_text(d, (W / 2, y0 - 100), heading, f(46), INK)
    k = 0
    for r, row in enumerate(rows):
        gap = 22
        total = sum(c["w"] for c in row) + gap * (len(row) - 1)
        x = (W - total) / 2
        for i, c in enumerate(row):
            c.setdefault("at", 0.3 + k * 0.3)
            c.setdefault("tilt", (-1.2, 1.0, -0.6, 1.4, -1.0)[k % 5])
            paste_card(img, x + c["w"] / 2, y0 + r * 150, c, t)
            x += c["w"] + gap
            k += 1


def C(lines, w=260, h=150, **kw):
    if isinstance(lines, str):
        lines = [lines]
    return dict(lines=lines, w=w, h=h, **kw)


HL = dict(fill=YELLOW)
HLR = dict(fill=YELLOW, fg=RED)


def mid_hook(img, t):
    flow(img, t, [C("Webサーバ"), C(["SYNが", "大量に届く"], fg=RED), C(["ダウン!?"], size=52, **HLR)], 1055)


def mid_handshake(img, t):
    flow(img, t, [C("SYN", w=230, fill=(186, 230, 253)), C("SYN-ACK", w=270, fill=(221, 214, 254)),
                  C("ACK", w=230, fill=MINT)], 1085, heading="3ウェイハンドシェイク")


def mid_slot(img, t):
    flow(img, t, [C(["SYNを", "受け取る"]), C(["枠を", "1つ確保"], **HL), C(["ACKで", "枠を解放"])], 1085,
         heading="サーバーの動き")


def mid_attack(img, t):
    flow(img, t, [C("攻撃者"), C(["偽装SYN", "×大量"], fg=RED, **HL), C("Webサーバ")], 1055)


def mid_noack(img, t):
    flow(img, t, [C("SYN-ACK"), C(["偽装IP", "(存在しない)"]), C(["ACKが", "来ない"], **HLR)], 1055)


def mid_dos(img, t):
    flow(img, t, [C(["枠", "8/8 満杯"], fg=RED), C(["正規SYNも", "破棄"]), C(["DoS"], size=60, **HLR)], 1055)


def mid_numbers(img, t):
    d = ImageDraw.Draw(img)
    for i, (title, num, unit, at) in enumerate([("満杯まで(この例)", "約7", "秒", 0.3), ("解放されるまで", "約60", "秒", 1.0)]):
        cx = 290 + i * 500
        spec = C([" "], w=440, h=250, at=at, tilt=(-1.5, 1.5)[i])
        paste_card(img, cx, 1055, spec, t)
        a = clamp((t - at - 0.25) / 0.2)
        if a > 0:
            bold_text(d, (cx - 5, 995), title, f(36), mix((255, 255, 255), INK, a))
            nf = f(120, True)
            nw = d.textlength(num, font=nf)
            d.text((cx - 5 - 25, 1080), num, font=nf, fill=mix((255, 255, 255), RED, a), anchor="mm",
                   stroke_width=2, stroke_fill=mix((255, 255, 255), RED, a))
            bold_text(d, (cx - 5 - 25 + nw / 2 + 32, 1105), unit, f(48), mix((255, 255, 255), RED, a))


def mid_cookie(img, t):
    flow(img, t, [C(["SYN-ACKに", "Cookie"], w=270), C(["ACKで", "検証"], w=250, **HL), C(["接続", "OK!"], w=250, fill=MINT)],
         1085, heading="SYN Cookie")


def mid_measures(img, t):
    grid(img, t, [[C("SYN Cookie", w=330, h=130, **HL), C("バックログ拡大", w=330, h=130)],
                  [C("再送回数を削減", w=330, h=130), C("レート制限", w=260, h=130), C("DDoS防御", w=250, h=130)]],
         995, heading="主な対策")


def mid_final(img, t):
    flow(img, t, [C(["ACK待ちの", "枠を狙う"]), C(["枠を", "埋め尽くす"], fg=RED), C(["SYN Cookie", "で防ぐ"], **HL)], 1055)


# ======================================================================
# 下段: 黄色の帯 + 字幕ボックス + キャラクター枠
# ======================================================================
BAND_Y0, BAND_Y1 = 1290, 1400


def draw_bottom_bg(d):
    d.rectangle((0, MID_Y1, W, H), fill=NAVY)
    for gx in range(0, W, 54):
        d.line((gx, MID_Y1, gx, H), fill=(24, 30, 54), width=1)
    for gy in range(MID_Y1, H, 54):
        d.line((0, gy, W, gy), fill=(24, 30, 54), width=1)
    d.rectangle((0, BAND_Y0, W, BAND_Y1), fill=YELLOW)
    for x in range(-200, W + 200, 36):
        d.line((x, BAND_Y1, x + 110, BAND_Y0), fill=(255, 225, 90), width=12)
    d.line((0, BAND_Y0, W, BAND_Y0), fill=INK, width=4)
    d.line((0, BAND_Y1, W, BAND_Y1), fill=INK, width=4)


def char_slot(d, expr, t):
    x0, y0, x1, y1 = 600, 1270, 1070, 1915
    col = (120, 132, 160)
    for x in range(x0, x1, 24):
        d.line((x, y0, min(x + 12, x1), y0), fill=col, width=3)
    for y in range(y0, y1, 24):
        d.line((x0, y, x0, min(y + 12, y1)), fill=col, width=3)
        d.line((x1, y, x1, min(y + 12, y1)), fill=col, width=3)
    bob = 6 * math.sin(t * 3)
    cx = (x0 + x1) / 2
    sil = (60, 72, 100)
    d.ellipse((cx - 105, y0 + 90 + bob, cx + 105, y0 + 300 + bob), fill=sil)
    d.rounded_rectangle((cx - 175, y0 + 320 + bob, cx + 175, y1 + 60), 80, fill=sil)
    tc(d, (cx, y0 + 420), "キャラクター枠", f(38), (170, 180, 205))
    tc(d, (cx, y0 + 470), "（後で差し替え）", f(28), (170, 180, 205))
    label = f"表情: {expr}"
    tw = d.textlength(label, font=f(30)) + 34
    d.rounded_rectangle((cx - tw / 2, y1 - 80, cx + tw / 2, y1 - 30), 24, fill=(30, 41, 59), outline=col, width=2)
    tc(d, (cx, y1 - 55), label, f(30), (241, 245, 249))


def caption(img, text, t):
    """白い吹き出しボックス。*...* は赤字 + 下線"""
    lines = text.split("\n")
    font = f(52)
    d0 = ImageDraw.Draw(img)
    widths = [sum(d0.textlength(s, font=font) for s in ln.split("*")) for ln in lines]
    bw = max(widths) + 80
    bh = 74 * len(lines) + 46
    a = ease(t / 0.22)
    pad = 14
    im = Image.new("RGBA", (int(bw) + pad * 2, int(bh) + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((pad + 8, pad + 8, pad + bw, pad + bh), 12, fill=INK + (255,))
    d.rounded_rectangle((pad, pad, pad + bw - 8, pad + bh - 8), 12, fill=(255, 255, 255, 255), outline=INK + (255,), width=5)
    for i, ln in enumerate(lines):
        y = pad + 23 + 37 + i * 74
        x = pad + (bw - 8) / 2 - widths[i] / 2
        for k, s in enumerate(ln.split("*")):
            col = RED if k % 2 else INK
            d.text((x, y), s, font=font, fill=col, anchor="lm", stroke_width=1, stroke_fill=col)
            sw = d.textlength(s, font=font)
            if k % 2 and s:
                d.line((x, y + 34, x + sw, y + 34), fill=RED, width=5)
            x += sw
    im = im.rotate(-1.0, resample=Image.BICUBIC, expand=True)
    if a < 1:
        im = im.resize((max(1, int(im.width * (0.85 + 0.15 * a))), max(1, int(im.height * (0.85 + 0.15 * a)))))
    x, y = 24, BAND_Y0 - 40
    img.paste(im, (x, int(y)), im)


# ======================================================================
# シーン: (長さ, 上段アニメ, 中段図解, 字幕, キャラ表情)
# ======================================================================
SCENES = [
    (5.0, lambda d, t: draw_flood(d, 6.0 + t * 1.6), mid_hook, "*SYN Flood*で\nサーバーがダウン!?", "驚き"),
    (5.0, lambda d, t: draw_normal(d, t), mid_handshake, "まずは\n*正常な接続*から", "説明"),
    (5.0, lambda d, t: draw_normal(d, 5.0 + t * 0.6), mid_slot, "ACKが来るまで\n*枠を確保*して待つ", "指さし"),
    (6.0, lambda d, t: draw_flood(d, t), mid_attack, "送信元を*偽装*して\nSYNを大量送信", "真剣"),
    (5.0, lambda d, t: draw_flood(d, 6.0 + t), mid_noack, "偽装IPだから\n*ACKが返ってこない*", "困り顔"),
    (5.0, lambda d, t: draw_flood(d, 11.0 + t), mid_dos, "枠が埋まって\n*正規ユーザーも接続不可*", "焦り"),
    (5.0, lambda d, t: draw_graph(d, ease(t / 3.5)), mid_numbers, "数秒で満杯、\n*約60秒*解放されない", "説明"),
    (6.0, lambda d, t: draw_cookie(d, t), mid_cookie, "対策は*SYN Cookie*\n枠を使わず検証", "笑顔"),
    (5.0, lambda d, t: draw_compare(d, t), mid_measures, "ほかの対策も\n*組み合わせる*", "楽しそう"),
    (5.0, lambda d, t: draw_shield(d, t), mid_final, "仕組みを知って\n*正しく守ろう!*", "手を振る"),
]


def total_dur():
    return sum(s[0] for s in SCENES)


def frame(tg):
    acc = 0.0
    for idx, (dur, top, mid, cap, expr) in enumerate(SCENES):
        if tg < acc + dur or idx == len(SCENES) - 1:
            t = tg - acc
            img = Image.new("RGB", (W, H), BG)
            draw_top(img, top, t, tg / total_dur())
            d = ImageDraw.Draw(img)
            draw_mid_bg(d)
            mid(img, t)
            d = ImageDraw.Draw(img)
            draw_bottom_bg(d)
            char_slot(d, expr, tg)
            caption(img, cap, t)
            return img
        acc += dur


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
