import { Spaceship } from '../models/Spaceship';
import { CommunicationSystem } from '../models/CommunicationSystem';
import { PacketType } from '../models/DataPacket';
import type { MainScene } from '../scenes/MainScene';

/**
 * 進行中ポーリング/ブロードキャスト 1件分。
 * - hubId/targetId は Spaceship.id（ブロードキャストでは hubId === targetId で sender 中心の波）
 * - rangeMode は描画時の最大半径計算に使用
 */
export interface ActivePoll {
  hubId: string;
  targetId: string;
  startTime: number;
  callReached: boolean;
  responseStarted: boolean;
  distance: number;
  isBroadcast?: boolean;
  rangeMode?: 'short' | 'long' | 'optical' | 'legacy';
  // レガシー星間通信用：通信惑星座標と、復路の最遠受信距離
  planetX?: number;
  planetY?: number;
  maxResponseDist?: number;
}

/**
 * 通信ロジック（ポーリング・光多重・データ転送）の管理。
 * draw 内のリンク描画は MainScene 側で getter 経由で参照する。
 */
export class CommunicationManager {
  private scene: MainScene;

  private activePolls: ActivePoll[] = [];
  // Link history: Key is "id1-id2" (ソート済み), value is timestamp of last success
  private lastLinkSuccess: Map<string, number> = new Map();

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  /**
   * Spaceship.update のコールバックから呼ばれる。
   * 次に通信したい target に対してポーリングを開始する。
   */
  handlePolling(node: Spaceship, target: Spaceship): void {
    const dist = CommunicationSystem.getDistance(node.x, node.y, target.x, target.y);
    const activeNodes = Array.from(this.scene.spaceships.values()).filter(s => s.isNodeActive);

    // 1. CMD packets は周波数によらず指令チャネルで送信
    const cmdPackets = node.queue.filter(p => p.type === PacketType.CMD);
    if (cmdPackets.length > 0) {
      const maxCmdRange = (node.isLongEnabled || target.isLongEnabled) ? 2500 : 750;
      if (dist <= maxCmdRange) {
        cmdPackets.forEach(p => {
          if (!target.queue.some(q => q.id === p.id)) {
            target.receivePacket(p);
            this.scene.showFloatingText(target.x, target.y, '指令受信', '#f59e0b');
          }
        });
      }
    }

    // 2. 通常通信は周波数一致が必要
    const { canConnect } = CommunicationSystem.getLinkQuality(
      node, target, activeNodes, this.scene.planetSystem.getPlanets()
    );
    if (canConnect) {
      const rangeMode: 'short' | 'long' =
        (node.isLongEnabled && target.isLongEnabled && node.longFreq === target.longFreq) ? 'long' : 'short';
      this.activePolls.push({
        hubId: node.id,
        targetId: target.id,
        startTime: this.scene.getTimeElapsedMs(),
        callReached: false,
        responseStarted: false,
        distance: dist,
        rangeMode
      });
    } else {
      // 周波数不一致 → 波アニメーションなし、次の target へ
      node.isWaitingForResponse = false;
    }
  }

  /**
   * TDMA タイミングで呼ばれる。光多重通信を試行する。
   */
  handleOpticalTransmission(ship: Spaceship): void {
    let transmissionOccurred = false;
    const activeNodes = Array.from(this.scene.spaceships.values()).filter(s => s.isNodeActive);

    // 750km 以内 (Optical range) の target に試行
    this.scene.spaceships.forEach(target => {
      if (target.id === ship.id) return;
      const { canConnect, dropRate } = CommunicationSystem.getOpticalMultiplexQuality(ship, target, activeNodes);
      if (canConnect && Math.random() >= dropRate) {
        transmissionOccurred = true;
        const packetsToTransmit = ship.getPacketsToTransmit();
        const packets = packetsToTransmit.length > 0
          ? packetsToTransmit.map(p => ({
              ...p,
              payload: { ...p.payload, isOptical: true, cipher: ship.multiplexCipher }
            }))
          : [{
              id: `heartbeat-${Date.now()}-${ship.id}`,
              type: PacketType.NORMAL,
              createdAt: Date.now(),
              originShipId: ship.id,
              payload: { isOptical: true, isHeartbeat: true }
            }];
        packets.forEach(p => target.receivePacket(p as any));
        this.recordLinkSuccess(ship.id, target.id);
      }
    });

    if (transmissionOccurred) {
      // 視覚エフェクト用のブロードキャスト poll を1つ追加
      this.activePolls.push({
        hubId: ship.id,
        targetId: ship.id, // sender 中心の波
        startTime: this.scene.getTimeElapsedMs(),
        callReached: true,
        responseStarted: true,
        distance: 0,
        rangeMode: 'optical'
      });
    }
  }

  /**
   * レガシー星間通信を試行する。
   * - 通信惑星 (PLN_COMM) が必須
   * - 発信ユニットから通信惑星へ往路、惑星から他レガシー有効ユニットへ復路
   * - 波速は光通信の3倍 (2250 km/s)
   */
  handleLegacyTransmission(sender: Spaceship): void {
    if (!sender.isLegacyEnabled) return;
    const commPlanet = this.scene.planetSystem.getCommPlanet();
    if (!commPlanet) return;

    const receivers = Array.from(this.scene.spaceships.values())
      .filter(s => s.id !== sender.id && s.isLegacyEnabled);
    if (receivers.length === 0) return;

    const distToPlanet = CommunicationSystem.getDistance(sender.x, sender.y, commPlanet.x, commPlanet.y);

    // 通信惑星から最も遠い受信ユニットまでの距離（復路の終了判定用）
    let maxResponseDist = 0;
    for (const r of receivers) {
      const d = CommunicationSystem.getDistance(commPlanet.x, commPlanet.y, r.x, r.y);
      if (d > maxResponseDist) maxResponseDist = d;
    }

    this.activePolls.push({
      hubId: sender.id,
      targetId: sender.id, // legacy では使用しない（planetX/Y を中心に使う）
      startTime: this.scene.getTimeElapsedMs(),
      callReached: false,
      responseStarted: false,
      distance: distToPlanet,
      rangeMode: 'legacy',
      planetX: commPlanet.x,
      planetY: commPlanet.y,
      maxResponseDist,
      isBroadcast: true, // sender の isWaitingForResponse を変更しない
    });
  }

  /**
   * 進行中の poll を1フレーム分処理する（往路衝突によるデータ受信、復路ブロードキャスト、削除）。
   * MainScene.update() から呼ぶ。
   */
  processActivePolls(delta: number): void {
    const waveSpeed = 750;
    const legacyWaveSpeed = 2250; // 光通信の3倍
    const timeElapsedMs = this.scene.getTimeElapsedMs();

    for (let i = this.activePolls.length - 1; i >= 0; i--) {
      const poll = this.activePolls[i];
      const elapsed = timeElapsedMs - poll.startTime;

      // レガシー星間通信は専用ロジックで処理
      if (poll.rangeMode === 'legacy') {
        const legacyNode = this.scene.spaceships.get(poll.hubId);
        if (!legacyNode || poll.planetX === undefined || poll.planetY === undefined) {
          this.activePolls.splice(i, 1);
          continue;
        }
        const legacyWaveDist = elapsed * (legacyWaveSpeed / 1000);

        // 1. 往路: sender → 通信惑星 到達時にデータ転送を一括実行
        if (!poll.callReached && legacyWaveDist >= poll.distance) {
          poll.callReached = true;
          poll.responseStarted = true;

          const regularPlanets = this.scene.planetSystem.getRegularPlanets();
          const receivers = Array.from(this.scene.spaceships.values())
            .filter(s => s.id !== legacyNode.id && s.isLegacyEnabled);
          const packetsToTransmit = legacyNode.getPacketsToTransmit();

          for (const receiver of receivers) {
            const { canConnect, dropRate } = CommunicationSystem.getLegacyLinkQuality(
              legacyNode, receiver, regularPlanets
            );
            if (!canConnect || Math.random() < dropRate) continue;
            if (packetsToTransmit.length > 0) {
              packetsToTransmit.forEach(p => receiver.receivePacket({
                ...p,
                payload: { ...(p.payload ?? {}), isLegacy: true }
              } as any));
            } else {
              // ハートビート（通信演出維持用）
              receiver.receivePacket({
                id: `legacy-hb-${Date.now()}-${legacyNode.id}-${receiver.id}`,
                type: PacketType.NORMAL,
                createdAt: Date.now(),
                originShipId: legacyNode.id,
                payload: { isLegacy: true, isHeartbeat: true }
              } as any);
            }
            this.recordLinkSuccess(legacyNode.id, receiver.id);
          }
        }

        // 2. 復路: 通信惑星 → 他ユニット（描画は MainScene、ここでは寿命のみ管理）
        if (poll.responseStarted) {
          const resElapsedMs = elapsed - (poll.distance / (legacyWaveSpeed / 1000));
          const resWaveDist = resElapsedMs * (legacyWaveSpeed / 1000);
          if (resWaveDist >= (poll.maxResponseDist ?? 0) + 300) {
            this.activePolls.splice(i, 1);
          }
        }
        continue;
      }

      const waveDist = elapsed * (waveSpeed / 1000);

      const node = this.scene.spaceships.get(poll.hubId);
      const target = this.scene.spaceships.get(poll.targetId);

      if (!node || !target) {
        if (!poll.isBroadcast && node) {
          node.isWaitingForResponse = false;
        }
        this.activePolls.splice(i, 1);
        continue;
      }

      const maxRange = poll.rangeMode === 'long' ? 2500 : 750;

      // 1. 往路パルス到達
      if (!poll.callReached && waveDist >= poll.distance) {
        poll.callReached = true;
        poll.responseStarted = true;

        const activeNodes = Array.from(this.scene.spaceships.values()).filter(s => s.isNodeActive);
        const planets = this.scene.planetSystem.getPlanets();

        // target → node のデータ転送
        const packetsToTx = target.getPacketsToTransmit();
        const successfulPackets = CommunicationSystem.transferData(target, node, packetsToTx, activeNodes, planets);
        if (successfulPackets.length > 0) {
          successfulPackets.forEach(p => node.receivePacket(p));
          this.scene.showFloatingText(node.x, node.y, 'データ受信', '#4ade80');
          this.recordLinkSuccess(node.id, target.id);
        }
        // node → target の queued パケット転送
        const nodePackets = node.queue;
        const successfulNodePackets = CommunicationSystem.transferData(node, target, nodePackets, activeNodes, planets);
        if (successfulNodePackets.length > 0) {
          successfulNodePackets.forEach(p => target.receivePacket(p));
          this.recordLinkSuccess(node.id, target.id);
        }
      }

      // 2. 復路ブロードキャスト（金色の波が拡大して周辺船にデータ伝搬）
      if (poll.responseStarted) {
        const resElapsed = elapsed - (poll.distance / (waveSpeed / 1000));
        const resWaveDist = resElapsed * (waveSpeed / 1000);
        const activeNodes = Array.from(this.scene.spaceships.values()).filter(s => s.isNodeActive);
        const planets = this.scene.planetSystem.getPlanets();

        this.scene.spaceships.forEach(nearbyShip => {
          if (nearbyShip.id === target.id) return; // 既に往路で交換済み
          const d = CommunicationSystem.getDistance(target.x, target.y, nearbyShip.x, nearbyShip.y);
          // 波がちょうどこの船に当たったか
          if (Math.abs(resWaveDist - d) < (waveSpeed * delta / 1000) * 1.5) {
            const packets = target.getPacketsToTransmit();
            const successful = CommunicationSystem.transferData(target, nearbyShip, packets, activeNodes, planets);
            if (successful.length > 0) {
              successful.forEach(p => nearbyShip.receivePacket(p));
              this.recordLinkSuccess(target.id, nearbyShip.id);
            }
          }
        });

        // 波が最大射程に達したら削除し、次のポーリングをトリガー
        if (resWaveDist >= maxRange) {
          if (!poll.isBroadcast && node) {
            node.isWaitingForResponse = false;
          }
          this.activePolls.splice(i, 1);
        }
      }
    }
  }

  /**
   * リンク成功を時刻付きで記録する。Quality 判定や描画で参照される。
   */
  recordLinkSuccess(id1: string, id2: string): void {
    const key = [id1, id2].sort().join('-');
    this.lastLinkSuccess.set(key, this.scene.getTimeElapsedMs());
  }

  /**
   * 描画用：進行中の poll 一覧。
   */
  getActivePolls(): ActivePoll[] {
    return this.activePolls;
  }

  /**
   * 描画用：リンク成功履歴。
   */
  getLastLinkSuccess(): Map<string, number> {
    return this.lastLinkSuccess;
  }
}
