# Space Network Game — 仕様書

## 1. 概要

宇宙艦隊の通信ネットワークを管制するシミュレーションゲーム。プレイヤーはオペレーター視点で複数の宇宙船 (ユニット) を指揮し、無線・光通信を駆使して所定のミッションを達成する。

- **プロジェクト名**: `space-network-game` ([package.json](package.json))
- **言語**: TypeScript
- **ビルドツール**: Vite 5.x
- **ゲームエンジン**: Phaser 3.80.x
- **その他依存**: framer-motion / Google Generative AI / MCP SDK / Playwright MCP / canvas

## 2. 起動方法

```bash
npm install
npm run dev      # 開発サーバー (vite --host)
npm run build    # tsc + vite build
npm run preview  # ビルド結果プレビュー
```

エントリポイント: [index.html](index.html) → [src/main.ts](src/main.ts) → [src/scenes/MainScene.ts](src/scenes/MainScene.ts)

## 3. ディレクトリ構成

| パス | 役割 |
| --- | --- |
| [src/main.ts](src/main.ts) | Phaser ゲーム初期化 (RESIZE スケール / Arcade physics / `MainScene` 登録) |
| [src/scenes/MainScene.ts](src/scenes/MainScene.ts) | メインシーン。描画、入力、UI、勝敗判定など全ゲームロジック |
| [src/models/Spaceship.ts](src/models/Spaceship.ts) | 宇宙船ユニットのドメインモデル |
| [src/models/Hub.ts](src/models/Hub.ts) | 通信ハブ (より長寿命/低速のノード) のドメインモデル |
| [src/models/DataPacket.ts](src/models/DataPacket.ts) | パケット型・周波数型・表示モード列挙 |
| [src/models/CommunicationSystem.ts](src/models/CommunicationSystem.ts) | 距離・回線品質・パケット転送ロジック (静的ユーティリティ) |
| [src/models/OpticalMaster.ts](src/models/OpticalMaster.ts) | 光多重通信 (TDMA) のマスター/スロット管理 |
| [src/components/](src/components/) | React/Framer Motion 用デモ HUD コンポーネント (`SpaceshipHUD-demo.tsx` 等) |
| [src/assets/](src/assets/) | 画像 (`Legacy_Destroyer.png`, `operator.png`, `spaceship.png`) |
| [index.html](index.html) | DOM 上の UI レイヤー (ミッション、ユニットモーダル、ブリーフィング等) |
| 各種 `generate-*.js` | アセット生成スクリプト (Hugging Face / Gemini など) |
| `*-mcp.js` | MCP サーバ (Hugging Face 画像、Gemini 画像) |
| [.mcp.json](.mcp.json) | MCP サーバ登録 (magic / playwright / gemini) |
| [.devcontainer/](.devcontainer/) | Dev Container 設定 |

## 4. ゲーム世界

- **マップ**: `8000 x 8000` のワールド。カメラは `(-4000, -4000)` を起点にバウンド設定。初期ズーム `0.4`、ホイールで `0.15 ~ 4.0` の間でズーム。
- **背景色**: `#020617`
- **クラッタ/干渉ゾーン**: 10 クラスタ、各 30〜80 個のクラッタを散布。`interferenceZones` はヘイズ表示用マーカー。
- **調査対象ポイント (`surveyPoint`)**: ワールド座標 `(3000, 3000)` 半径 `200`。黄色サークルで描画。
- **入力**: 左クリック = ドラッグでパン / クリックでユニット選択またはターゲット指定。ホイール = ズーム。

## 5. ユニット (`Spaceship`)

初期配置: `HQ Ship` (中心) + `Ship-1` / `Ship-2` / `Ship-3` (HQ 周辺の編隊)。`HQ Ship` は `isNodeActive = true` でポーリングリスト `[Ship-1, Ship-2, Ship-3]` を持つ。

### 5.1 主要プロパティ ([Spaceship.ts](src/models/Spaceship.ts))

- `id`, `x`, `y`, `vx`, `vy`, `targetX/Y`, `MAX_SPEED = 50`
- `level` (1〜): レベルが高いほど周波数変更時のミス確率と反映遅延が小さい
  - 反映遅延: `(6 - level) * 1.5` 秒
  - ミス確率: `(5 - level) * 0.15`
- 通信状態
  - `isShortEnabled` / `shortFreq: 'A' | 'B' | 'C'` (短距離 750km)
  - `isLongEnabled` / `longFreq: 'D' | 'E' | 'F'` (長距離 2500km)
  - `isTransmitProhibited`: 送信禁止フラグ
- 機材ステータス `equipment`: `shortAntenna / longAntenna / cipher / processor / display` を `green | yellow | red` で保持
  - 短距離回線可動条件: `shortAntenna`, `cipher`, `processor` がすべて `red` 以外
  - 長距離回線可動条件: `longAntenna`, `cipher`, `processor` がすべて `red` 以外
- 光多重通信 (TDMA)
  - `isMultiplexEnabled`, `multiplexSpeed: 'low' | 'medium' | 'high'`, `multiplexCipher: 'AA' | 'BB'`
  - `isOpticalRelayEnabled`: 中継 (Multi-hop) ON/OFF
  - `selectedMasterId`, `assignedSlots`, `lastTransmittedSlot`
- ノード機能
  - `isNodeActive`, `pollingList[]`, `currentPollingIndex`, `isWaitingForResponse`
  - `POLLING_DELAY_MS = 33`
- HP: `hp = 100 / maxHp = 100`
- 受信履歴: `lastReceivedSourceId`, `lastReceivedAt`
- パケットキュー `queue: DataPacket[]` — 90 秒で自動削除
- 周波数変更の遅延適用: `pendingFreqChange`, `pendingCmdId`, `processedCmdIds` (二重適用を防止)

### 5.2 主要メソッド

- `update(dt, allShips?, onPoll?)`: 移動、ノード ポーリング、`pendingFreqChange` の適用、古いパケットの破棄
- `receivePacket(packet)`:
  - `FREQ_CHANGE` / `CMD` の場合は宛先一致時のみ `pendingFreqChange` にセット (既処理 ID は無視)
  - 光パケットは `cipher` 不一致なら破棄、`isOpticalRelayEnabled` が OFF かつ自分宛でなければ破棄
  - 重複キュー登録の防止
- `applyFreqChange(payload)`: 即時適用 + `RGR` パケットを生成
- `getPacketsToTransmit()`: 送信禁止でなければキューのコピーを返す
- `isShortCommFunctional() / isLongCommFunctional()`: 機材チェイン可動判定

## 6. ハブ (`Hub`)

`Spaceship` と類似のフィールドを持つが以下が異なる:

- `MAX_SPEED = 20` (低速)
- `hp / maxHp = 200` (高耐久)
- `rgrStatus: Map<string, any>` で各ユニットの RGR を保持
- `broadcastFreqChange(payload)`:
  - 10 秒間 (`TRANSITION_DURATION_MS = 10000`) の遷移期間に旧周波数を `oldShortFreq / oldLongFreq` 等として保持
  - キューに `FREQ_CHANGE` パケットを追加
  - `rgrStatus` をクリア
- ポーリング間隔 `POLLING_DELAY_MS = 200` (Spaceship の約 1/3 速度)

## 7. パケットモデル ([DataPacket.ts](src/models/DataPacket.ts))

```ts
enum PacketType { NORMAL, DETECTION, FREQ_CHANGE, CMD, RGR, SURVEY_DATA }
type FreqShort = 'A' | 'B' | 'C';
type FreqLong  = 'D' | 'E' | 'F';
enum SystemDisplayMode { CONTROL, COMBAT }

interface DataPacket {
  id: string;
  type: PacketType;
  createdAt: number;
  originShipId: string;
  targetShipId?: string; // 省略時はブロードキャスト
  payload?: any;
}
```

## 8. 通信モデル ([CommunicationSystem.ts](src/models/CommunicationSystem.ts))

すべて `static` ユーティリティ。

### 8.1 `getDistance(x1,y1,x2,y2)`
ユークリッド距離 (km)。

### 8.2 `getLinkQuality(sender, receiver, activeNodes[])`

- **周波数一致条件**:
  - `shortMatch` = 双方の `isShortEnabled` && `shortFreq` 一致
  - `longMatch`  = 双方の `isLongEnabled` && `longFreq` 一致
- **最大到達距離**: `longMatch` なら 2500km、それ以外で `shortMatch` なら 750km
- **ベース ドロップレート**:
  - `longMatch`: `(dist / 2500) * 0.4`
  - `shortMatch`: `(dist / 750) * 0.2` (両方一致時は最小値を採用)
- **衝突ペナルティ**: 750km 以内に存在する自分以外のアクティブノード 1 体ごとに `+0.5`
- 戻り値: `{ canConnect, dropRate }` (drop は `[0, 1]` にクランプ)

### 8.3 `getOpticalMultiplexQuality(sender, receiver, activeNodes[])`

- 双方が `isMultiplexEnabled` かつ同じ `selectedMasterId` であること
- 最大到達距離 750km
- 暗号 (`multiplexCipher`) が一致すること
- 速度モードによる干渉倍率: low=1, medium=2, high=4
- 衝突ペナルティ: 300km 以内のノード 1 体ごとに `+0.3 * multiplier`
- ベース ドロップレート: `(dist / 200) * 0.1`

### 8.4 `transferData(sender, receiver, packets, activeNodes)`

- `CMD` パケットは到達距離内 (long なら 2500km、それ以外 750km) なら必ず通す
- 光多重で接続可能なら光側でロール (確率 `1 - opticalDrop` で通過)
- それ以外は標準回線でロール (確率 `1 - radioDrop` で通過)

## 9. 光多重通信 / TDMA ([OpticalMaster.ts](src/models/OpticalMaster.ts))

- `FRAME_DURATION_SEC = 20` 秒
- `SLOT_DURATION_SEC = 0.3` 秒
- `MAX_SLOTS = 200`
- `getCurrentSlotIndex(nowSec)`: グローバル時間からスロット番号を算出
- `assignNextAvailableSlot(shipId)`: 空きスロットを 1 つ割り当てる
- 初期マスター: `Master-Alpha` (中心 -1000,-1000)、`Master-Beta` (中心 +1000,+1000)

## 10. ミッション (`MainScene`)

ブリーフィング (起動時にフルスクリーン表示):
> 「情報によると、特定ポイントにおいて敵の活動が活発化している。各ユニットは通信連絡を密とし、調査に向かえ。正当防衛、緊急避難以外の武器使用は禁止する」
>
> オペレーター: 「指示ポイントを黄サークルで表示しました」

### 10.1 勝利条件 (`checkWinLoss`)

| ID | 条件 |
| --- | --- |
| `m-reach` | いずれかの艦が `surveyPoint` 半径 200 内に到達する |
| `m-all-link` | 全ユニットが HQ Ship と接続可能 (`getLinkQuality.canConnect`) |
| `m-data` | HQ Ship のキューに `SURVEY_DATA` パケットが届く |

調査ポイント内の艦は約 1 秒に 1 回 `SURVEY_DATA` パケットを生成する。3 条件すべて達成で `MISSION SUCCESS` パネル表示。

### 10.2 表示モード

- `SystemDisplayMode.CONTROL`: 通信管制モード (デフォルト)
- `SystemDisplayMode.COMBAT`: 戦闘モード — `mode-toggle-btn` で切替

### 10.3 可視化モード (`vizMode`)

- `circles`: 通信圏サークル表示 (デフォルト)
- `dots`: パケット通信を点で可視化
- `quality`: 回線品質表示
- `range`: 距離レンジ表示

`viz-cycle-btn` で循環。

## 11. UI 構成 ([index.html](index.html))

- `#mission-panel`: 司令官オーダー / ミッション 3 項目チェックリスト
- `.hud-panel`: 経過時間、モード切替ボタン、可視化切替ボタン
- `#briefing-overlay`: 起動時にフルスクリーンで表示。`#start-mission-btn` で閉じる
- `#unit-modal` (右上 320px、最大高 90vh):
  - ユニット ID / TYPE / LV
  - **光多重通信設定** アコーディオン: 有効化、連接マスター選択、速度 (Low/Medium/High)、暗号 (AA/BB)、中継 ON/OFF
  - **光通信設定** アコーディオン: 短距離 (750km) 有効・周波数 (A/B/C)、長距離 (2500km) 有効・周波数 (D/E/F)、ノード設定ボタン、全般宛 周波数変更ボタン
  - HP バー
  - Communication Status トグル (RGR 一覧)
- `#scale-bar-container` (右下): 100km スケールバー
- `#game-over-panel`: 勝敗結果 + RESTART ボタン

## 12. 周波数変更フロー

1. プレイヤーがモーダルで周波数を変更し「全般宛 周波数変更」を押下、または `Hub.broadcastFreqChange` を呼び出し
2. `FREQ_CHANGE` / `CMD` パケットがネットワークへ伝播
3. 受信した `Spaceship` は `pendingFreqChange` にセット、`(6 - level) * 1.5` 秒後に適用
4. レベルに応じて `(5 - level) * 0.15` の確率で誤った周波数になる (作戦行動の不確実性を表現)
5. 適用後、`RGR` パケットをキューへ発信。同じ CMD ID は再適用されない
6. `Hub` は 10 秒間 旧周波数 (`oldShortFreq` 等) を保持し、その間は旧/新両方の周波数で受信可能

## 13. ノード/ポーリング

- `isNodeActive` な艦は `pollingList` を順番に巡回し、`onPoll(sender, target)` コールバックを発火
- `Spaceship`: 33ms 間隔。応答待ち中 (`isWaitingForResponse`) は次のポーリングを抑制
- `Hub`: 200ms 間隔
- 750km 以内の他のアクティブノードはお互いに干渉ペナルティを与える

## 14. Dev Container / MCP

- [.devcontainer/](.devcontainer/) で開発環境を提供 (Linux / Node.js ベース、WSL2 上で確認)
- [.mcp.json](.mcp.json) に登録された MCP サーバ:
  - `magic` (`@21st-dev/magic`) — UI コンポーネント生成 (環境変数 `TWENTY_FIRST_API_KEY`)
  - `playwright` (`@playwright/mcp`) — ブラウザ自動化
  - `gemini` (`gemini-image-mcp.js`) — Gemini 画像生成 (環境変数 `GEMINI_API_KEY`)
- 補助スクリプト: `verify-hf-token.js`, `check-env.js`
- アセット生成スクリプト: `generate-earth*.js`, `generate-spaceship*.js`, `generate-operator.js` 等

## 15. 既知の制約 / TODO

- [TASKS.md](TASKS.md), [CLAUDE.md](CLAUDE.md) は現状空ファイル
- 武器使用 / 戦闘モード固有のロジックは `SystemDisplayMode.COMBAT` で表示切替のみ実装、攻防処理は最小限
- `Hub` は `MainScene` の初期化シーンには含まれていない (ロジックのみ実装済み、利用は将来拡張)
- `src/lib/` は空ディレクトリ。`src/components/` には React 用の HUD デモ (`SpaceshipHUD-demo.tsx`) があるが、現在の本体ゲーム ([main.ts](src/main.ts)) は Phaser 単体で動作

## 16. 用語集

| 用語 | 意味 |
| --- | --- |
| 短距離光通信 | 周波数 A/B/C、最大 750km |
| 長距離光通信 | 周波数 D/E/F、最大 2500km |
| 光多重通信 | TDMA 方式、最大 750km、暗号 AA/BB、速度 low/medium/high |
| ノード | ポーリングを行う中継艦 (`isNodeActive`) |
| RGR | "Roger" 応答パケット (周波数変更受領通知) |
| CMD | コマンドパケット (周波数変更指示など) |
| クラッタ | 戦域に散在する反射源/障害物の点 |
