export enum PacketType {
  NORMAL = 'NORMAL',
  DETECTION = 'DETECTION',
  FREQ_CHANGE = 'FREQ_CHANGE',
  CMD = 'CMD',
  RGR = 'RGR',
  SURVEY_DATA = 'SURVEY_DATA'
}

export type FreqShort = 'A' | 'B' | 'C';
export type FreqLong = 'D' | 'E' | 'F';

export enum SystemDisplayMode {
  CONTROL = 'CONTROL',
  COMBAT = 'COMBAT'
}

export interface DataPacket {
  id: string;
  type: PacketType;
  createdAt: number;
  originShipId: string;
  targetShipId?: string; // Target unit (optional for broadcast)
  payload?: any;
}
