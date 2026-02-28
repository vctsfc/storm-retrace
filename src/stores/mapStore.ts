import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BaseMapStyle = 'dark' | 'satellite' | 'light';

export interface MapState {
  center: [number, number];
  zoom: number;
  baseMapStyle: BaseMapStyle;
  /** Show additional town/village labels at lower zoom levels */
  showMoreLabels: boolean;

  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setBaseMapStyle: (style: BaseMapStyle) => void;
  setShowMoreLabels: (show: boolean) => void;
}

export const BASE_MAP_STYLES: Record<BaseMapStyle, string | object> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; Esri',
      },
    },
    layers: [
      {
        id: 'satellite-tiles',
        type: 'raster',
        source: 'satellite',
      },
    ],
  },
};

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      center: [-97.5, 35.5],
      zoom: 6,
      baseMapStyle: 'dark',
      showMoreLabels: false,

      setCenter: (center) => set({ center }),
      setZoom: (zoom) => set({ zoom }),
      setBaseMapStyle: (style) => set({ baseMapStyle: style }),
      setShowMoreLabels: (show) => set({ showMoreLabels: show }),
    }),
    {
      name: 'storm-replay-map',
      partialize: (state) => ({
        baseMapStyle: state.baseMapStyle,
        showMoreLabels: state.showMoreLabels,
      }),
    },
  ),
);
