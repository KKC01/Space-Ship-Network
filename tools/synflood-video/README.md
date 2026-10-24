# SYN Flood 解説動画

SYN Flood 攻撃の流れを時系列で見せる解説動画のジェネレータ。
Python (Pillow) でフレームを描き、ffmpeg で MP4 に書き出す。ゲーム本体とは独立している。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `make_short.py` | **縦型ショート版 (1080x1920, 約52秒)**。現在の本命 |
| `make_video.py` | 横長版 (1280x720)。ナレーション付き出力にも対応 |
| `fonts.py` | OS ごとの日本語フォント探索 |
| `output/syn_flood_short.mp4` | 縦型ショート版 (音声なし・キャラ枠は仮) |
| `output/syn_flood.mp4` | 横長版 (音声なし, 61秒) |
| `output/syn_flood_narrated.mp4` | 横長版 + Open JTalk ナレーション (約2分35秒) |

## セットアップ

1. Python 3.10+ と ffmpeg (PATH に通す) を用意
   - Windows: `winget install Gyan.FFmpeg`
   - macOS: `brew install ffmpeg`
2. パッケージ

   ```bash
   pip install pillow
   # 横長版 (make_video.py) を作る場合のみ
   pip install numpy scipy pyopenjtalk-plus
   ```

3. 日本語フォントは自動検出 (Linux: IPAゴシック / Windows: メイリオ, MS ゴシック / macOS: ヒラギノ)。
   見つからない場合は環境変数 `SYN_FONT` (本文) と `SYN_MONO` (等幅) にパスを指定する。

## 使い方

このフォルダで実行する。

```bash
# 縦型ショート版
python make_short.py output/syn_flood_short.mp4
# 指定秒のプレビュー静止画 (prev_0.png, prev_1.png, ...)
python make_short.py still prev 2.5 13.5 28.5

# 横長版 (ナレーション付きで出力。numpy / scipy / pyopenjtalk-plus が必要)
python make_video.py output/syn_flood_narrated.mp4
python make_video.py still prev 7.0 23.5
```

## 編集ポイント

- `make_short.py` の `SCENES`：シーンごとの (長さ, 字幕, チェックリスト, メイン描画, 下段左パネル, キャラ表情)
  - 字幕の `*...*` で囲んだ部分は黄色で強調される
- `make_video.py` の `NARR`：ナレーション原稿。読み上げの長さに合わせて各区間の尺が自動で伸びる

## 引き継ぎ (2026-10-24 時点)

- 参考動画: https://youtube.com/shorts/JMXQpANrnnk
  (上半分にメイン画面、中央にチェックリスト、下段左に図解、下段右にアニメ調キャラという構成)
- 済み: 縦型ショート版のレイアウト・アニメーション・字幕 (`make_short.py`)
- 未着手 (ユーザーが後で指示):
  - **キャラクター**：下段右の「キャラクター枠」(`char_slot`) を差し替える。
    シーンごとに想定表情 (驚き/説明/指さし/真剣/困り顔/焦り/笑顔/楽しそう/手を振る) を付けてある。
    表情ごとの透過 PNG を用意して貼り付ける想定
  - **音声**：声が決まったら、`make_video.py` の `NARR` / `plan()` / `warp()` と同じ仕組みを
    `make_short.py` に移植し、読み上げの長さに合わせて各シーンの尺を伸ばす
- 備考: クラウド環境では Microsoft / Google の読み上げにはネットワーク制限で接続できなかったため、
  横長版のナレーションは Open JTalk (オフライン) で合成している
