export type ClipboardFormat =
  | 'eft'
  | 'dscan'
  | 'signatures'
  | 'hangar'
  | 'route'
  | 'local'
  | 'unknown';

export interface ParsedEftModuleLine {
  name: string;
  charge?: string;
  offline?: boolean;
  quantity?: number;
}

export interface ParsedEftFit {
  format: 'eft';
  shipName: string;
  fitName: string;
  lines: ParsedEftModuleLine[];
  raw: string;
}

export interface ParsedDScanEntry {
  typeId?: number;
  name: string;
  typeName: string;
  distanceRaw: string;
  distanceMeters: number | null;
}

export interface ParsedDScan {
  format: 'dscan';
  entries: ParsedDScanEntry[];
  raw: string;
}

export interface ParsedCosmicSignature {
  sigId: string;
  sigGroup: string;
  sigType: string;
  name: string;
  signalStrength: string;
  distance: string;
}

export interface ParsedSignatures {
  format: 'signatures';
  entries: ParsedCosmicSignature[];
  raw: string;
}

export interface ParsedHangarItem {
  name: string;
  quantity: number;
  groupName?: string;
  categoryName?: string;
  estimatedPrice?: number;
}

export interface ParsedHangar {
  format: 'hangar';
  items: ParsedHangarItem[];
  raw: string;
}

export interface ParsedRouteWaypoint {
  systemName: string;
  security?: number;
  jumpsFromStart?: number;
}

export interface ParsedRoute {
  format: 'route';
  waypoints: ParsedRouteWaypoint[];
  raw: string;
}

export interface ParsedLocal {
  format: 'local';
  pilotNames: string[];
  raw: string;
}

export interface ParsedUnknown {
  format: 'unknown';
  raw: string;
}

export type ParsedClipboard =
  | ParsedEftFit
  | ParsedDScan
  | ParsedSignatures
  | ParsedHangar
  | ParsedRoute
  | ParsedLocal
  | ParsedUnknown;

