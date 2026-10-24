"""OS ごとの日本語フォントを探す。環境変数 SYN_FONT / SYN_MONO で上書き可能。"""
import os

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf",  # Linux (fonts-ipafont)
    "C:/Windows/Fonts/meiryo.ttc",  # Windows
    "C:/Windows/Fonts/YuGothM.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",  # macOS
]
MONO_CANDIDATES = [
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "C:/Windows/Fonts/msgothic.ttc",
    "/System/Library/Fonts/Osaka.ttf",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
]


def _find(env, candidates):
    path = os.environ.get(env)
    if path:
        return path
    for p in candidates:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"日本語フォントが見つかりません。環境変数 {env} にフォントのパスを指定してください")


FONT = _find("SYN_FONT", FONT_CANDIDATES)
MONO = _find("SYN_MONO", MONO_CANDIDATES)
