import { Spaceship } from './Spaceship';
import { DataPacket } from './DataPacket';

export class CommunicationSystem {
  // 惑星による通信干渉半径
  public static readonly PLANET_LONG_RANGE_INTERFERENCE = 2500;
  public static readonly PLANET_SHORT_RANGE_INTERFERENCE = 700;
  // 干渉時に加算するドロップレートペナルティ
  public static readonly PLANET_INTERFERENCE_PENALTY = 0.5;

  public static getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  public static getLinkQuality(
    sender: Spaceship,
    receiver: Spaceship,
    _activeNodes: Spaceship[] = [],
    planets: { id?: string; x: number; y: number }[] = []
  ): { canConnect: boolean, dropRate: number } {
    const dist = this.getDistance(sender.x, sender.y, receiver.x, receiver.y);

    const shortMatch = sender.isShortEnabled && receiver.isShortEnabled && sender.shortFreq === receiver.shortFreq;
    const longMatch = sender.isLongEnabled && receiver.isLongEnabled && sender.longFreq === receiver.longFreq;

    if (!shortMatch && !longMatch) return { canConnect: false, dropRate: 1.0 };

    const maxAllowedDist = longMatch ? 2500 : 750;
    if (dist > maxAllowedDist) return { canConnect: false, dropRate: 1.0 };

    let baseDropRate = 1.0;
    if (longMatch) baseDropRate = (dist / 2500) * 0.4;
    if (shortMatch) {
       const shortRate = (dist / 750) * 0.2;
       baseDropRate = Math.min(baseDropRate, shortRate);
    }

    // 惑星による干渉ペナルティ（通信惑星は干渉源として扱わない）
    let interferencePenalty = 0;
    for (const planet of planets) {
      if (planet.id === 'PLN_COMM' || planet.id === 'PLN_COMM_TCP') continue;
      const senderDistP = this.getDistance(sender.x, sender.y, planet.x, planet.y);
      const receiverDistP = this.getDistance(receiver.x, receiver.y, planet.x, planet.y);
      const inLongRange = senderDistP <= this.PLANET_LONG_RANGE_INTERFERENCE || receiverDistP <= this.PLANET_LONG_RANGE_INTERFERENCE;
      const inShortRange = senderDistP <= this.PLANET_SHORT_RANGE_INTERFERENCE || receiverDistP <= this.PLANET_SHORT_RANGE_INTERFERENCE;
      if (longMatch && inLongRange) interferencePenalty += this.PLANET_INTERFERENCE_PENALTY;
      if (shortMatch && inShortRange) interferencePenalty += this.PLANET_INTERFERENCE_PENALTY;
    }

    const finalDropRate = Math.min(1.0, baseDropRate + interferencePenalty);
    return { canConnect: true, dropRate: finalDropRate };
  }

  /**
   * レガシー星間通信の品質判定。
   * - 両ユニットで isLegacyEnabled = true が必要
   * - 距離制限なし（中継惑星経由のため）
   * - 干渉ペナルティは標準無線と同等（妨害に弱い仕様）
   * - 通信惑星の存在チェックは呼び出し側で実施する
   */
  public static getLegacyLinkQuality(
    sender: Spaceship,
    receiver: Spaceship,
    planets: { id?: string; x: number; y: number }[] = []
  ): { canConnect: boolean, dropRate: number } {
    if (!sender.isLegacyEnabled || !receiver.isLegacyEnabled) {
      return { canConnect: false, dropRate: 1.0 };
    }

    // 干渉ペナルティ（標準無線と同等）
    const LEGACY_PENALTY = this.PLANET_INTERFERENCE_PENALTY;
    let interferencePenalty = 0;
    for (const planet of planets) {
      // 通信惑星自身（レガシー/TCP/IP 用）は干渉源として扱わない
      if (planet.id === 'PLN_COMM' || planet.id === 'PLN_COMM_TCP') continue;
      const senderDistP = this.getDistance(sender.x, sender.y, planet.x, planet.y);
      const receiverDistP = this.getDistance(receiver.x, receiver.y, planet.x, planet.y);
      const inLongRange = senderDistP <= this.PLANET_LONG_RANGE_INTERFERENCE || receiverDistP <= this.PLANET_LONG_RANGE_INTERFERENCE;
      const inShortRange = senderDistP <= this.PLANET_SHORT_RANGE_INTERFERENCE || receiverDistP <= this.PLANET_SHORT_RANGE_INTERFERENCE;
      if (inLongRange) interferencePenalty += LEGACY_PENALTY;
      if (inShortRange) interferencePenalty += LEGACY_PENALTY;
    }

    const finalDropRate = Math.min(1.0, interferencePenalty);
    return { canConnect: true, dropRate: finalDropRate };
  }

  /**
   * TCP/IP 星間通信の品質判定。
   * - 両ユニットで isTcpIpEnabled = true が必要
   * - 距離制限なし（新型通信惑星経由のため）
   * - 干渉ペナルティは標準無線と同等（妨害に弱い仕様）
   * - 通信惑星の存在チェックは呼び出し側で実施する
   */
  public static getTcpIpLinkQuality(
    sender: Spaceship,
    receiver: Spaceship,
    planets: { id?: string; x: number; y: number }[] = []
  ): { canConnect: boolean, dropRate: number } {
    if (!sender.isTcpIpEnabled || !receiver.isTcpIpEnabled) {
      return { canConnect: false, dropRate: 1.0 };
    }

    // 干渉ペナルティ（標準無線と同等）
    const TCP_PENALTY = this.PLANET_INTERFERENCE_PENALTY;
    let interferencePenalty = 0;
    for (const planet of planets) {
      // 通信惑星自身（レガシー/TCP/IP 用）は干渉源として扱わない
      if (planet.id === 'PLN_COMM' || planet.id === 'PLN_COMM_TCP') continue;
      const senderDistP = this.getDistance(sender.x, sender.y, planet.x, planet.y);
      const receiverDistP = this.getDistance(receiver.x, receiver.y, planet.x, planet.y);
      const inLongRange = senderDistP <= this.PLANET_LONG_RANGE_INTERFERENCE || receiverDistP <= this.PLANET_LONG_RANGE_INTERFERENCE;
      const inShortRange = senderDistP <= this.PLANET_SHORT_RANGE_INTERFERENCE || receiverDistP <= this.PLANET_SHORT_RANGE_INTERFERENCE;
      if (inLongRange) interferencePenalty += TCP_PENALTY;
      if (inShortRange) interferencePenalty += TCP_PENALTY;
    }

    const finalDropRate = Math.min(1.0, interferencePenalty);
    return { canConnect: true, dropRate: finalDropRate };
  }

  public static getOpticalMultiplexQuality(sender: Spaceship, receiver: Spaceship, _activeNodes: Spaceship[] = []): { canConnect: boolean, dropRate: number } {
    // 0. MUST be enabled on BOTH sides and MUST have a master selected
    if (!sender.isMultiplexEnabled || !receiver.isMultiplexEnabled) return { canConnect: false, dropRate: 1.0 };
    if (!sender.selectedMasterId || !receiver.selectedMasterId || sender.selectedMasterId !== receiver.selectedMasterId) return { canConnect: false, dropRate: 1.0 };

    // 1. Check distance (Increased to 750km for visibility)
    const dist = this.getDistance(sender.x, sender.y, receiver.x, receiver.y);
    if (dist > 750) return { canConnect: false, dropRate: 1.0 };

    // 2. Check encryption
    if (sender.multiplexCipher !== receiver.multiplexCipher) return { canConnect: false, dropRate: 1.0 };

    const baseDropRate = (dist / 200) * 0.1;
    const finalDropRate = Math.min(1.0, baseDropRate);

    return { canConnect: true, dropRate: finalDropRate };
  }

  public static transferData(
    sender: Spaceship,
    receiver: Spaceship,
    packets: DataPacket[],
    activeNodes: Spaceship[] = [],
    planets: { x: number; y: number }[] = []
  ): DataPacket[] {
    const { canConnect: standardConnect, dropRate: radioDrop } = this.getLinkQuality(sender, receiver, activeNodes, planets);
    const { canConnect: opticalConnect, dropRate: opticalDrop } = this.getOpticalMultiplexQuality(sender, receiver, activeNodes);

    return packets.filter(p => {
      if (p.type === 'CMD') {
        const dist = this.getDistance(sender.x, sender.y, receiver.x, receiver.y);
        const maxDist = (sender.isLongEnabled || receiver.isLongEnabled) ? 2500 : 750;
        return dist <= maxDist;
      }
      if (opticalConnect && opticalDrop < 1.0) return Math.random() >= opticalDrop;
      if (!standardConnect || radioDrop >= 1.0) return false;
      return Math.random() >= radioDrop;
    });
  }
}
