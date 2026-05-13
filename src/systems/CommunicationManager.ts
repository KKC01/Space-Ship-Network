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
  rangeMode?: 'short' | 'long' | 'optical';
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
   * 進行中の poll を1フレーム分処理する（往路衝突によるデータ受信、復路ブロードキャスト、削除）。
   * MainScene.update() から呼ぶ。
   */
  processActivePolls(delta: number): void {
    const waveSpeed = 750;
    const timeElapsedMs = this.scene.getTimeElapsedMs();

    for (let i = this.activePolls.length - 1; i >= 0; i--) {
      const poll = this.activePolls[i];
      const elapsed = timeElapsedMs - poll.startTime;
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
