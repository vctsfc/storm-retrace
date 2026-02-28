export interface ScanFile {
  key: string;
  timestamp: number;
  size: number;
  /** 0-based sweep within volume (undefined = legacy/all sweeps merged) */
  sweepIndex?: number;
  /** Total sweeps detected in parent volume (set when SAILS detected) */
  sweepCount?: number;
  /** NEXRAD site ID that produced this scan (multi-site handoff) */
  siteId?: string;
  /** Site latitude in degrees (multi-site handoff) */
  siteLat?: number;
  /** Site longitude in degrees (multi-site handoff) */
  siteLon?: number;
}

export interface FrameStats {
  vcp: number;
  elevationAngle: number;
  maxRef: number | null;
  gatesAbove50: number;
  gatesAbove60: number;
  maxInboundVel: number | null;
  maxOutboundVel: number | null;
}

export interface RenderedFrame {
  /** Pre-computed blob URL for instant MapLibre display (no toBlob at render time) */
  blobUrl: string;
  timestamp: number;
  product: string;
  elevation: number;
  siteLat: number;
  siteLon: number;
  rangeKm: number;
  stats?: FrameStats;
}
