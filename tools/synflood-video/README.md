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

- `make_short.py` の `SCENES`：シーンごとの (長さ, 上段アニメ, 中段の図解カード, 字幕, キャラ表情)
  - 画面は3段：上段=ネットワークのアニメ / 中段=クリーム地に黒フチのカード図解 / 下段=黄色の帯 + 字幕 + キャラ枠
  - 字幕の `*...*` で囲んだ部分は赤字 + 下線で強調される
  - 中段のカードは `mid_*` 関数で定義（`C(文言, w, h, fill=..., fg=...)` を `flow()` で矢印つなぎ、`grid()` で格子並べ）
- `make_video.py` の `NARR`：ナレーション原稿。読み上げの長さに合わせて各区間の尺が自動で伸びる

## 引き継ぎ (2026-10-24 時点)

- ブランチ: `ccr-4457f7f3-99qwf6`（main 未マージ。PR を作って main に入れる）
- 縦型ショート (`make_short.py`) の現状:
  - 上段 (0-850px): グラデーション背景 + 影付きアイコンカード + 光るパケット（Web の解説アニメのトレンドを参考）
  - 中段 (850-1260px): クリーム地に黒フチのカード図解（参考ショート動画のコミック調）
  - 下段 (1260-1920px): 黄色の帯 + 字幕ボックス + キャラクター枠（仮）
- 参考動画: https://youtube.com/shorts/JMXQpANrnnk と、ユーザー提供の photocraft_short.mp4
  （上=画面、中=黒フチカード、下=黄色帯+字幕+アニメ調キャラ という3段構成）
- 未着手 (ユーザーが後で指示):
  - **キャラクター**：下段右の `char_slot()` を差し替え。シーンごとの想定表情は `SCENES` の最後の要素
  - **音声**：`make_video.py` の `NARR` / `plan()` / `warp()` の仕組みを移植し、読み上げ長に合わせて尺を伸ばす
  - 中段・下段も上段のモダンな雰囲気に寄せるかは未決定
- プレビュー: `python make_short.py still prev 3 19 39.5` で指定秒の静止画を確認できる
- 備考: クラウド環境では Microsoft / Google の読み上げはネットワーク制限で使えず、横長版は Open JTalk で合成した
