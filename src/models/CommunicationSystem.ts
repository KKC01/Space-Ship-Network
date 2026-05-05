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
    
    // Strict frequency matching — no overrides for normal communication
    if (!shortMatch && !longMatch) return { canConnect: false, dropRate: 1.0 };
    
    // Physical range limit
    const maxAllowedDist = longMatch ? 2500 : 750;
    if (dist > maxAllowedDist) return { canConnect: false, dropRate: 1.0 };

    let baseDropRate = 1.0;
    if (longMatch) {
       baseDropRate = (dist / 2500) * 0.4;
    }
    if (shortMatch) {
       const shortRate = (dist / 750) * 0.2;
       baseDropRate = Math.min(baseDropRate, shortRate);
    }

    // Multi-Node Collision Penalty
    let collisionPenalty = 0;
    if (activeNodes.length > 1) {
       activeNodes.forEach(otherNode => {
          if (otherNode.id !== sender.id) {
             const nodeDist = this.getDistance(sender.x, sender.y, otherNode.x, otherNode.y);
             if (nodeDist <= 750) {
                collisionPenalty += 0.5;
             }
          }
       });
    }
    
    const finalDropRate = Math.min(1.0, baseDropRate + collisionPenalty);
    return { canConnect: true, dropRate: finalDropRate };
  }

  public static transferData(sender: Spaceship, receiver: Spaceship, packets: DataPacket[], activeNodes: Spaceship[] = []): DataPacket[] {
    // Standard link check
    const { canConnect: standardConnect, dropRate } = this.getLinkQuality(sender, receiver, activeNodes);
    
    return packets.filter(p => {
      // Emergency Override: CMD packets ignore frequency/mode matching if within physical range
      if (p.type === 'CMD') {
        const dist = this.getDistance(sender.x, sender.y, receiver.x, receiver.y);
        // Physical limits: 2500km if either has long enabled, else 750km
        const maxDist = (sender.isLongEnabled || receiver.isLongEnabled) ? 2500 : 750;
        return dist <= maxDist;
      }
      
      // Normal packets: Require standard connection
      if (!standardConnect || dropRate >= 1.0) return false;
      return Math.random() >= dropRate;
    });
  }
}
