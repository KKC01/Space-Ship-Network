export class OpticalMaster {
  public id: string;
  public x: number;
  public y: number;

  public static readonly FRAME_DURATION_SEC = 20;
  public static readonly SLOT_DURATION_SEC = 0.3;
  public static readonly MAX_SLOTS = 200;

  private slotAssignments: Map<string, number[]> = new Map(); // shipId -> slot indices

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }

  /**
   * Get current slot index based on global time (seconds)
   */
  public getCurrentSlotIndex(currentTimeSec: number): number {
    const timeInFrame = currentTimeSec % OpticalMaster.FRAME_DURATION_SEC;
    return Math.floor(timeInFrame / OpticalMaster.SLOT_DURATION_SEC);
  }

  /**
   * Assign a slot to a ship. For now, we'll auto-assign the next available slot.
   */
  public assignNextAvailableSlot(shipId: string): number {
    const assigned = this.getShipSlots(shipId);
    if (assigned.length > 0) return assigned[0];

    // Find first empty slot
    const occupied = new Set<number>();
    this.slotAssignments.forEach(slots => slots.forEach(s => occupied.add(s)));

    for (let i = 0; i < OpticalMaster.MAX_SLOTS; i++) {
      if (!occupied.has(i) && (i * OpticalMaster.SLOT_DURATION_SEC < OpticalMaster.FRAME_DURATION_SEC)) {
        this.assignSlot(shipId, i);
        return i;
      }
    }
    return -1;
  }

  public assignSlot(shipId: string, slotIndex: number) {
    if (!this.slotAssignments.has(shipId)) {
      this.slotAssignments.set(shipId, []);
    }
    this.slotAssignments.get(shipId)?.push(slotIndex);
  }

  public getShipSlots(shipId: string): number[] {
    return this.slotAssignments.get(shipId) || [];
  }

  public isShipSlot(shipId: string, slotIndex: number): boolean {
    const slots = this.slotAssignments.get(shipId);
    return slots ? slots.includes(slotIndex) : false;
  }
}
