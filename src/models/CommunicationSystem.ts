import { Spaceship } from './Spaceship';
import { DataPacket } from './DataPacket';

export class CommunicationSystem {
  public static getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  public static getLinkQuality(sender: Spaceship, receiver: Spaceship, activeNodes: Spaceship[] = []): { canConnect: boolean, dropRate: number } {
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

    let collisionPenalty = 0;
    if (activeNodes.length > 1) {
       activeNodes.forEach(otherNode => {
          if (otherNode.id !== sender.id) {
             const nodeDist = this.getDistance(sender.x, sender.y, otherNode.x, otherNode.y);
             if (nodeDist <= 750) collisionPenalty += 0.5;
          }
       });
    }
    
    const finalDropRate = Math.min(1.0, baseDropRate + collisionPenalty);
    return { canConnect: true, dropRate: finalDropRate };
  }

  public static getOpticalMultiplexQuality(sender: Spaceship, receiver: Spaceship, activeNodes: Spaceship[] = []): { canConnect: boolean, dropRate: number } {
    // 0. MUST be enabled on BOTH sides and MUST have a master selected
    if (!sender.isMultiplexEnabled || !receiver.isMultiplexEnabled) return { canConnect: false, dropRate: 1.0 };
    if (!sender.selectedMasterId || !receiver.selectedMasterId || sender.selectedMasterId !== receiver.selectedMasterId) return { canConnect: false, dropRate: 1.0 };

    // 1. Check distance (Increased to 750km for visibility)
    const dist = this.getDistance(sender.x, sender.y, receiver.x, receiver.y);
    if (dist > 750) return { canConnect: false, dropRate: 1.0 };

    // 2. Check encryption
    if (sender.multiplexCipher !== receiver.multiplexCipher) return { canConnect: false, dropRate: 1.0 };

    // 3. Interference based on speed mode
    let multiplier = 1.0;
    if (sender.multiplexSpeed === 'medium') multiplier = 2.0;
    if (sender.multiplexSpeed === 'high') multiplier = 4.0;

    let collisionPenalty = 0;
    if (activeNodes.length > 1) {
      activeNodes.forEach(otherNode => {
        if (otherNode.id !== sender.id) {
          const nodeDist = this.getDistance(sender.x, sender.y, otherNode.x, otherNode.y);
          if (nodeDist <= 300) collisionPenalty += 0.3 * multiplier;
        }
      });
    }

    const baseDropRate = (dist / 200) * 0.1;
    const finalDropRate = Math.min(1.0, baseDropRate + collisionPenalty);

    return { canConnect: true, dropRate: finalDropRate };
  }

  public static transferData(sender: Spaceship, receiver: Spaceship, packets: DataPacket[], activeNodes: Spaceship[] = []): DataPacket[] {
    const { canConnect: standardConnect, dropRate: radioDrop } = this.getLinkQuality(sender, receiver, activeNodes);
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
