export interface ScanFile {
  key: string;
  timestamp: number;
  size: number;
  /** 0-based sweep within volume (undefined = legacy/all sweeps merged) */
  sweepIndex?: number;
  /** Total sweeps detected in parent volume (set when SAILS detected) */
  sweepCount?: number;
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
}
