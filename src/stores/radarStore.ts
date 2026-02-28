import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BUILTIN_PALETTES, type ColorStop } from '../services/nexrad/colorTables';
import type { SmoothingMode } from '../services/nexrad/renderLogic';
import type { FrameStats } from '../services/nexrad/types';

export type RadarProduct = 'REF' | 'VEL' | 'ZDR' | 'CC' | 'KDP';

export interface NexradSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation: number;
  tz: string; // IANA timezone, e.g. "America/Chicago"
}

export interface ScanFile {
  key: string;
  timestamp: number;
  size: number;
  /** 0-based sweep within volume (undefined = legacy/all sweeps merged) */
  sweepIndex?: number;
  /** Total sweeps detected in parent volume (set when SAILS detected) */
  sweepCount?: number;
}

export interface RadarState {
  /** Currently selected NEXRAD site */
  selectedSite: NexradSite | null;
  /** Current radar product to display */
  product: RadarProduct;
  /** Current elevation angle index */
  elevationIndex: number;
  /** Available elevation angles for the current scan */
  availableElevations: number[];
  /** 1-based elevation numbers corresponding to each entry in availableElevations */
  availableElevationNumbers: number[];
  /** List of scan files for the loaded event */
  scanFiles: ScanFile[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Radar layer opacity (0-1) */
  radarOpacity: number;
  /** Smoothing mode for radar imagery: 'none' | 'low' | 'high' */
  radarSmoothing: SmoothingMode;

  /** Background prefetch progress (null = idle, {completed, total} = active) */
  prefetchProgress: { completed: number; total: number } | null;

  /** Active palette name per product (e.g. { REF: 'NWS Default', VEL: 'Scope' }) */
  paletteName: Record<string, string>;
  /** User-imported custom palette tables per product */
  customPalettes: Record<string, Record<string, ColorStop[]>>;
  /** Incremented on any palette change; used in cache keys to invalidate stale frames */
  paletteVersion: number;

  setSelectedSite: (site: NexradSite | null) => void;
  setProduct: (product: RadarProduct) => void;
  setElevationIndex: (index: number) => void;
  setAvailableElevations: (elevations: number[], elevationNumbers?: number[]) => void;
  setScanFiles: (files: ScanFile[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setRadarOpacity: (opacity: number) => void;
  setRadarSmoothing: (smoothing: SmoothingMode) => void;
  setPrefetchProgress: (progress: { completed: number; total: number } | null) => void;
  setPalette: (product: string, name: string) => void;
  addCustomPalette: (product: string, name: string, stops: ColorStop[]) => void;
  /** Current frame statistics for the storm attributes overlay */
  currentFrameStats: FrameStats | null;
  setCurrentFrameStats: (stats: FrameStats | null) => void;
  /** Force a full re-render of all cached radar frames (bumps paletteVersion) */
  forceRerender: () => void;
}

export const useRadarStore = create<RadarState>()(
  persist(
    (set) => ({
      selectedSite: null,
      product: 'REF',
      elevationIndex: 0,
      availableElevations: [],
      availableElevationNumbers: [],
      scanFiles: [],
      loading: false,
      error: null,
      radarOpacity: 0.85,
      radarSmoothing: 'none' as SmoothingMode,
      prefetchProgress: null,

      paletteName: { REF: 'NWS Default', VEL: 'NWS Default' },
      customPalettes: {},
      paletteVersion: 0,

      currentFrameStats: null,
      setCurrentFrameStats: (stats) => set({ currentFrameStats: stats }),

      setSelectedSite: (site) => set({ selectedSite: site }),
      setProduct: (product) => set({ product }),
      setElevationIndex: (index) => set({ elevationIndex: index }),
      setAvailableElevations: (elevations, elevationNumbers) => set({
        availableElevations: elevations,
        availableElevationNumbers: elevationNumbers ?? elevations.map((_, i) => i + 1),
      }),
      setScanFiles: (files) => set({ scanFiles: files }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setRadarOpacity: (opacity) => set({ radarOpacity: opacity }),
      setRadarSmoothing: (smoothing) => set({ radarSmoothing: smoothing }),
      setPrefetchProgress: (progress) => set({ prefetchProgress: progress }),

      setPalette: (product, name) => set((state) => ({
        paletteName: { ...state.paletteName, [product]: name },
        paletteVersion: state.paletteVersion + 1,
      })),

      addCustomPalette: (product, name, stops) => set((state) => ({
        customPalettes: {
          ...state.customPalettes,
          [product]: { ...(state.customPalettes[product] ?? {}), [name]: stops },
        },
      })),

      forceRerender: () => set((state) => ({
        paletteVersion: state.paletteVersion + 1,
      })),
    }),
    {
      name: 'storm-replay-radar',
      version: 1, // Bumped for boolean → string smoothing migration
      // Only persist user preferences — NOT ephemeral state like scanFiles, loading, etc.
      partialize: (state) => ({
        selectedSite: state.selectedSite,
        product: state.product,
        radarOpacity: state.radarOpacity,
        radarSmoothing: state.radarSmoothing,
        paletteName: state.paletteName,
        customPalettes: state.customPalettes,
      }),
      migrate: (persisted: any, version: number) => {
        if (version === 0) {
          // Migrate boolean smoothing → string union
          const sm = persisted.radarSmoothing;
          if (sm === true) persisted.radarSmoothing = 'low';
          else if (sm === false || sm === undefined) persisted.radarSmoothing = 'none';
        }
        return persisted;
      },
    },
  ),
);

/**
 * Resolve the active color table for a product from the current store state.
 * Checks custom palettes first, then falls back to built-in palettes.
 * Returns undefined if no palette is found (caller should use default).
 */
export function getActiveColorTable(state: RadarState, product: string): ColorStop[] | undefined {
  const name = state.paletteName[product] ?? 'NWS Default';
  // Check custom (user-imported) palettes first
  const custom = state.customPalettes[product]?.[name];
  if (custom) return custom;
  // Fall back to built-in palettes
  return BUILTIN_PALETTES[product]?.[name];
}
