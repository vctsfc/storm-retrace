import { createContext, useContext } from 'react';
import type maplibregl from 'maplibre-gl';

/**
 * React context for sharing the MapLibre map instance with child components.
 * The map is set to null until the map's 'load' event fires.
 */
const MapContext = createContext<maplibregl.Map | null>(null);

export const MapProvider = MapContext.Provider;

/**
 * Hook to get the current MapLibre map instance.
 * Returns null if the map hasn't loaded yet.
 */
export function useMap(): maplibregl.Map | null {
  return useContext(MapContext);
}
