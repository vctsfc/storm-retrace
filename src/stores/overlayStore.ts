import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Warning types from IEM ──────────────────────────────────────────

export interface NWSWarning {
  /** Unique ID: `${wfo}-${phenomena}-${significance}-${eventid}` */
  id: string;
  /** Event type code: TO, SV, FF */
  phenomena: string;
  /** Significance code: W (Warning) */
  significance: string;
  /** Weather Forecast Office */
  wfo: string;
  /** Event tracking number */
  eventid: number;
  /** Issue time (UTC ms) */
  issue: number;
  /** Expire time (UTC ms) */
  expire: number;
  /** Lifecycle status: NEW, UPG, EXP, CAN, etc. */
  status: string;
  /** Tornado emergency flag */
  is_emergency: boolean;
  /** Particularly Dangerous Situation flag */
  is_pds: boolean;
  /** Hail threat tag (e.g. "2.00") */
  hailtag: string | null;
  /** Wind threat tag (e.g. "70") */
  windtag: string | null;
  /** GeoJSON geometry */
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
}

// ── SPC Watch types ─────────────────────────────────────────────────

export interface SPCWatch {
  /** Unique ID: `${type}-${num}` */
  id: string;
  /** Watch type: TOR (tornado) or SVR (severe thunderstorm) */
  type: 'TOR' | 'SVR';
  /** Watch number */
  num: number;
  /** Issue time (UTC ms) */
  issue: number;
  /** Expire time (UTC ms) */
  expire: number;
  /** Particularly Dangerous Situation flag */
  is_pds: boolean;
  /** GeoJSON geometry */
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
}

// ── Mesoscale Discussion types ──────────────────────────────────────

export interface MesoscaleDiscussion {
  /** Unique ID: `MCD-${year}-${num}` */
  id: string;
  /** MCD number */
  num: number;
  /** Year */
  year: number;
  /** Issue time (UTC ms) */
  issue: number;
  /** Expire time (UTC ms) */
  expire: number;
  /** Watch confidence percentage (0-100) or null */
  watch_confidence: number | null;
  /** Concerning text */
  concerning: string;
  /** GeoJSON geometry */
  geometry: GeoJSON.Polygon;
}

// ── Convective Outlook types ────────────────────────────────────────

export interface ConvectiveOutlook {
  /** Unique ID: `OTL-${threshold}` */
  id: string;
  /** Threshold code */
  threshold: 'TSTM' | 'MRGL' | 'SLGT' | 'ENH' | 'MDT' | 'HIGH';
  /** Category (CATEGORICAL, TORNADO, WIND, HAIL) */
  category: string;
  /** Issue time (UTC ms) */
  issue: number;
  /** Expire time (UTC ms) */
  expire: number;
  /** GeoJSON geometry */
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
}

// ── Local Storm Report types ────────────────────────────────────────

export interface LocalStormReport {
  /** Unique ID: `LSR-${valid}-${lat}-${lon}` */
  id: string;
  /** Report type char code: T, H, G, D, F, C, etc. */
  type: string;
  /** Human-readable type text */
  typetext: string;
  /** Magnitude: hail size (inches), wind speed (knots), etc. */
  magnitude: number | null;
  /** Valid time (UTC ms) */
  valid: number;
  /** Latitude */
  lat: number;
  /** Longitude */
  lon: number;
  /** Nearest city */
  city: string;
  /** County */
  county: string;
  /** State abbreviation */
  state: string;
  /** Report source */
  source: string;
  /** Remark text */
  remark: string;
  /** GeoJSON point geometry */
  geometry: GeoJSON.Point;
}

// ── ASOS Station types ─────────────────────────────────────────────

export interface ASOSStation {
  /** Station identifier (e.g. "OKC", "TUL") */
  id: string;
  /** Station name */
  name: string;
  /** Latitude */
  lat: number;
  /** Longitude */
  lon: number;
  /** IEM network (e.g. "OK_ASOS") */
  network: string;
  /** Elevation in meters */
  elevation: number;
}

// ── Surface Observation types ──────────────────────────────────────

export interface SurfaceObservation {
  /** Station identifier */
  station: string;
  /** Latitude */
  lat: number;
  /** Longitude */
  lon: number;
  /** Observation valid time (UTC ms) */
  utcValid: number;
  /** Temperature (°F) or null if missing */
  tmpf: number | null;
  /** Dewpoint (°F) or null if missing */
  dwpf: number | null;
  /** Wind direction (degrees, 0-360) or null if calm/missing */
  drct: number | null;
  /** Wind speed (knots) or null if calm/missing */
  sknt: number | null;
  /** Wind gust (knots) or null if no gust */
  gust: number | null;
  /** Mean sea level pressure (mb) or null */
  mslp: number | null;
  /** Sky cover code (CLR, FEW, SCT, BKN, OVC) or null */
  skyc1: string | null;
}

// ── Overlay state ───────────────────────────────────────────────────

export interface OverlayState {
  // ── Warnings ──
  warnings: NWSWarning[];
  warningsLoading: boolean;
  warningsError: string | null;
  warningsVisible: boolean;
  warningsTimeSynced: boolean;
  warningsOpacity: number;

  setWarnings: (warnings: NWSWarning[]) => void;
  setWarningsLoading: (loading: boolean) => void;
  setWarningsError: (error: string | null) => void;
  setWarningsVisible: (visible: boolean) => void;
  setWarningsTimeSynced: (synced: boolean) => void;
  setWarningsOpacity: (opacity: number) => void;
  clearWarnings: () => void;

  // ── Watches ──
  watches: SPCWatch[];
  watchesLoading: boolean;
  watchesError: string | null;
  watchesVisible: boolean;
  watchesTimeSynced: boolean;
  watchesOpacity: number;

  setWatches: (watches: SPCWatch[]) => void;
  setWatchesLoading: (loading: boolean) => void;
  setWatchesError: (error: string | null) => void;
  setWatchesVisible: (visible: boolean) => void;
  setWatchesTimeSynced: (synced: boolean) => void;
  setWatchesOpacity: (opacity: number) => void;
  clearWatches: () => void;

  // ── Mesoscale Discussions ──
  mcds: MesoscaleDiscussion[];
  mcdsLoading: boolean;
  mcdsError: string | null;
  mcdsVisible: boolean;
  mcdsTimeSynced: boolean;
  mcdsOpacity: number;

  setMCDs: (mcds: MesoscaleDiscussion[]) => void;
  setMCDsLoading: (loading: boolean) => void;
  setMCDsError: (error: string | null) => void;
  setMCDsVisible: (visible: boolean) => void;
  setMCDsTimeSynced: (synced: boolean) => void;
  setMCDsOpacity: (opacity: number) => void;
  clearMCDs: () => void;

  // ── Convective Outlooks ──
  outlooks: ConvectiveOutlook[];
  outlooksLoading: boolean;
  outlooksError: string | null;
  outlooksVisible: boolean;
  outlooksOpacity: number;

  setOutlooks: (outlooks: ConvectiveOutlook[]) => void;
  setOutlooksLoading: (loading: boolean) => void;
  setOutlooksError: (error: string | null) => void;
  setOutlooksVisible: (visible: boolean) => void;
  setOutlooksOpacity: (opacity: number) => void;
  clearOutlooks: () => void;

  // ── Local Storm Reports ──
  lsrs: LocalStormReport[];
  lsrsLoading: boolean;
  lsrsError: string | null;
  lsrsVisible: boolean;
  lsrsTimeSynced: boolean;
  lsrsOpacity: number;

  setLSRs: (lsrs: LocalStormReport[]) => void;
  setLSRsLoading: (loading: boolean) => void;
  setLSRsError: (error: string | null) => void;
  setLSRsVisible: (visible: boolean) => void;
  setLSRsTimeSynced: (synced: boolean) => void;
  setLSRsOpacity: (opacity: number) => void;
  clearLSRs: () => void;

  // ── Surface Observations ──
  surfaceObs: SurfaceObservation[];
  surfaceObsStations: ASOSStation[];
  surfaceObsLoading: boolean;
  surfaceObsError: string | null;
  surfaceObsVisible: boolean;
  surfaceObsTimeSynced: boolean;
  surfaceObsOpacity: number;

  setSurfaceObs: (obs: SurfaceObservation[]) => void;
  setSurfaceObsStations: (stations: ASOSStation[]) => void;
  setSurfaceObsLoading: (loading: boolean) => void;
  setSurfaceObsError: (error: string | null) => void;
  setSurfaceObsVisible: (visible: boolean) => void;
  setSurfaceObsTimeSynced: (synced: boolean) => void;
  setSurfaceObsOpacity: (opacity: number) => void;
  clearSurfaceObs: () => void;

  // ── Bulk actions ──
  clearAllOverlays: () => void;
}

export const useOverlayStore = create<OverlayState>()(
  persist(
    (set) => ({
  // ── Warnings ──
  warnings: [],
  warningsLoading: false,
  warningsError: null,
  warningsVisible: true,
  warningsTimeSynced: true,
  warningsOpacity: 1.0,

  setWarnings: (warnings) => set({ warnings }),
  setWarningsLoading: (loading) => set({ warningsLoading: loading }),
  setWarningsError: (error) => set({ warningsError: error }),
  setWarningsVisible: (visible) => set({ warningsVisible: visible }),
  setWarningsTimeSynced: (synced) => set({ warningsTimeSynced: synced }),
  setWarningsOpacity: (opacity) => set({ warningsOpacity: opacity }),
  clearWarnings: () => set({ warnings: [], warningsError: null }),

  // ── Watches ──
  watches: [],
  watchesLoading: false,
  watchesError: null,
  watchesVisible: true,
  watchesTimeSynced: true,
  watchesOpacity: 1.0,

  setWatches: (watches) => set({ watches }),
  setWatchesLoading: (loading) => set({ watchesLoading: loading }),
  setWatchesError: (error) => set({ watchesError: error }),
  setWatchesVisible: (visible) => set({ watchesVisible: visible }),
  setWatchesTimeSynced: (synced) => set({ watchesTimeSynced: synced }),
  setWatchesOpacity: (opacity) => set({ watchesOpacity: opacity }),
  clearWatches: () => set({ watches: [], watchesError: null }),

  // ── Mesoscale Discussions ──
  mcds: [],
  mcdsLoading: false,
  mcdsError: null,
  mcdsVisible: true,
  mcdsTimeSynced: true,
  mcdsOpacity: 1.0,

  setMCDs: (mcds) => set({ mcds }),
  setMCDsLoading: (loading) => set({ mcdsLoading: loading }),
  setMCDsError: (error) => set({ mcdsError: error }),
  setMCDsVisible: (visible) => set({ mcdsVisible: visible }),
  setMCDsTimeSynced: (synced) => set({ mcdsTimeSynced: synced }),
  setMCDsOpacity: (opacity) => set({ mcdsOpacity: opacity }),
  clearMCDs: () => set({ mcds: [], mcdsError: null }),

  // ── Convective Outlooks ──
  outlooks: [],
  outlooksLoading: false,
  outlooksError: null,
  outlooksVisible: true,
  outlooksOpacity: 1.0,

  setOutlooks: (outlooks) => set({ outlooks }),
  setOutlooksLoading: (loading) => set({ outlooksLoading: loading }),
  setOutlooksError: (error) => set({ outlooksError: error }),
  setOutlooksVisible: (visible) => set({ outlooksVisible: visible }),
  setOutlooksOpacity: (opacity) => set({ outlooksOpacity: opacity }),
  clearOutlooks: () => set({ outlooks: [], outlooksError: null }),

  // ── Local Storm Reports ──
  lsrs: [],
  lsrsLoading: false,
  lsrsError: null,
  lsrsVisible: true,
  lsrsTimeSynced: true,
  lsrsOpacity: 1.0,

  setLSRs: (lsrs) => set({ lsrs }),
  setLSRsLoading: (loading) => set({ lsrsLoading: loading }),
  setLSRsError: (error) => set({ lsrsError: error }),
  setLSRsVisible: (visible) => set({ lsrsVisible: visible }),
  setLSRsTimeSynced: (synced) => set({ lsrsTimeSynced: synced }),
  setLSRsOpacity: (opacity) => set({ lsrsOpacity: opacity }),
  clearLSRs: () => set({ lsrs: [], lsrsError: null }),

  // ── Surface Observations ──
  surfaceObs: [],
  surfaceObsStations: [],
  surfaceObsLoading: false,
  surfaceObsError: null,
  surfaceObsVisible: false,
  surfaceObsTimeSynced: true,
  surfaceObsOpacity: 1.0,

  setSurfaceObs: (obs) => set({ surfaceObs: obs }),
  setSurfaceObsStations: (stations) => set({ surfaceObsStations: stations }),
  setSurfaceObsLoading: (loading) => set({ surfaceObsLoading: loading }),
  setSurfaceObsError: (error) => set({ surfaceObsError: error }),
  setSurfaceObsVisible: (visible) => set({ surfaceObsVisible: visible }),
  setSurfaceObsTimeSynced: (synced) => set({ surfaceObsTimeSynced: synced }),
  setSurfaceObsOpacity: (opacity) => set({ surfaceObsOpacity: opacity }),
  clearSurfaceObs: () => set({ surfaceObs: [], surfaceObsStations: [], surfaceObsError: null }),

  // ── Bulk actions ──
  clearAllOverlays: () =>
    set({
      warnings: [],
      warningsError: null,
      watches: [],
      watchesError: null,
      mcds: [],
      mcdsError: null,
      outlooks: [],
      outlooksError: null,
      lsrs: [],
      lsrsError: null,
      surfaceObs: [],
      surfaceObsStations: [],
      surfaceObsError: null,
    }),
    }),
    {
      name: 'storm-replay-overlays',
      // Only persist user toggle preferences — NOT data arrays or loading/error state
      partialize: (state) => ({
        warningsVisible: state.warningsVisible,
        warningsTimeSynced: state.warningsTimeSynced,
        warningsOpacity: state.warningsOpacity,
        watchesVisible: state.watchesVisible,
        watchesTimeSynced: state.watchesTimeSynced,
        watchesOpacity: state.watchesOpacity,
        mcdsVisible: state.mcdsVisible,
        mcdsTimeSynced: state.mcdsTimeSynced,
        mcdsOpacity: state.mcdsOpacity,
        outlooksVisible: state.outlooksVisible,
        outlooksOpacity: state.outlooksOpacity,
        lsrsVisible: state.lsrsVisible,
        lsrsTimeSynced: state.lsrsTimeSynced,
        lsrsOpacity: state.lsrsOpacity,
        surfaceObsVisible: state.surfaceObsVisible,
        surfaceObsTimeSynced: state.surfaceObsTimeSynced,
        surfaceObsOpacity: state.surfaceObsOpacity,
      }),
    },
  ),
);
