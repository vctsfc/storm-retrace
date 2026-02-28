/**
 * Map safety utility.
 *
 * After map.remove(), MapLibre's internal `style` property becomes undefined.
 * Any subsequent call to map.getLayer(), getSource(), setFilter(), etc.
 * throws "Cannot read properties of undefined (reading 'getLayer')".
 *
 * This utility checks if the map is still usable before operations.
 */

import type maplibregl from 'maplibre-gl';

/**
 * Check if a MapLibre map instance is still usable.
 * Returns false if map is null, undefined, or has been destroyed via map.remove().
 */
export function isMapUsable(map: maplibregl.Map | null | undefined): map is maplibregl.Map {
  if (!map) return false;
  // After map.remove(), the internal style is cleared.
  // Accessing it via the private property is the cheapest check.
  try {
    return (map as any).style != null;
  } catch {
    return false;
  }
}
