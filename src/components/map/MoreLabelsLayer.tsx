import { useEffect, useRef } from 'react';
import { useMap } from './MapContext';
import { useMapStore, type BaseMapStyle } from '../../stores/mapStore';

/**
 * CARTO vector tile source URL (same source used by dark-matter and positron styles).
 * Used to add place labels on the satellite basemap, which has no vector source.
 */
const CARTO_VECTOR_SOURCE_URL = 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json';
const EXTRA_SOURCE_ID = 'extra-labels-source';
const LAYER_PREFIX = 'extra-labels-';

/**
 * Get text styling based on current basemap.
 */
function getLabelPaint(basemap: BaseMapStyle) {
  if (basemap === 'light') {
    return { color: '#444', haloColor: 'rgba(255,255,255,0.85)' };
  }
  // dark and satellite both use light text
  return { color: 'rgba(220,220,220,0.9)', haloColor: 'rgba(0,0,0,0.7)' };
}

/**
 * Add supplementary town/village label layers to show smaller population centers.
 *
 * CARTO dark-matter shows towns at z8+ and villages at z10+.
 * This adds layers that show them at lower zoom levels:
 *   - Towns visible from z6 (was z8)
 *   - Villages visible from z8 (was z10)
 *   - Hamlets/neighborhoods visible from z10 (was z12)
 */
function addExtraLabels(map: maplibregl.Map, basemap: BaseMapStyle) {
  // Determine which vector source to use
  let sourceName: string;

  if (basemap === 'satellite') {
    // Satellite has no vector source — add one
    if (!map.getSource(EXTRA_SOURCE_ID)) {
      map.addSource(EXTRA_SOURCE_ID, {
        type: 'vector',
        url: CARTO_VECTOR_SOURCE_URL,
      });
    }
    sourceName = EXTRA_SOURCE_ID;
  } else {
    // dark/light CARTO styles already have a 'carto' vector source
    sourceName = 'carto';
  }

  const { color, haloColor } = getLabelPaint(basemap);

  // Towns at z6-8 (they already appear at z8+ in the base style)
  if (!map.getLayer(LAYER_PREFIX + 'towns')) {
    map.addLayer({
      id: LAYER_PREFIX + 'towns',
      type: 'symbol',
      source: sourceName,
      'source-layer': 'place',
      minzoom: 6,
      maxzoom: basemap === 'satellite' ? 14 : 8, // On satellite, show all the way since there are no base labels
      filter: ['==', 'class', 'town'],
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 8, 12],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-max-width': 8,
        'text-padding': 4,
      },
      paint: {
        'text-color': color,
        'text-halo-color': haloColor,
        'text-halo-width': 1.2,
      },
    });
  }

  // Villages at z8-10 (they already appear at z10+ in the base style)
  if (!map.getLayer(LAYER_PREFIX + 'villages')) {
    map.addLayer({
      id: LAYER_PREFIX + 'villages',
      type: 'symbol',
      source: sourceName,
      'source-layer': 'place',
      minzoom: 8,
      maxzoom: basemap === 'satellite' ? 16 : 10,
      filter: ['==', 'class', 'village'],
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 10, 11],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-max-width': 7,
        'text-padding': 3,
      },
      paint: {
        'text-color': color,
        'text-halo-color': haloColor,
        'text-halo-width': 1,
      },
    });
  }

  // Hamlets/neighborhoods at z10-12 (they already appear at z12+ in the base style)
  if (!map.getLayer(LAYER_PREFIX + 'hamlets')) {
    map.addLayer({
      id: LAYER_PREFIX + 'hamlets',
      type: 'symbol',
      source: sourceName,
      'source-layer': 'place',
      minzoom: 10,
      maxzoom: basemap === 'satellite' ? 16 : 12,
      filter: ['any', ['==', 'class', 'hamlet'], ['==', 'class', 'neighbourhood']],
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-max-width': 6,
        'text-padding': 2,
      },
      paint: {
        'text-color': color,
        'text-halo-color': haloColor,
        'text-halo-width': 1,
        'text-opacity': 0.8,
      },
    });
  }

  // For satellite basemap, also add city labels since there are none
  if (basemap === 'satellite') {
    if (!map.getLayer(LAYER_PREFIX + 'cities')) {
      map.addLayer({
        id: LAYER_PREFIX + 'cities',
        type: 'symbol',
        source: sourceName,
        'source-layer': 'place',
        minzoom: 4,
        maxzoom: 15,
        filter: ['==', 'class', 'city'],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 14],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-max-width': 10,
          'text-padding': 4,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        },
      });
    }

    // State labels for satellite
    if (!map.getLayer(LAYER_PREFIX + 'states')) {
      map.addLayer({
        id: LAYER_PREFIX + 'states',
        type: 'symbol',
        source: sourceName,
        'source-layer': 'place',
        minzoom: 4,
        maxzoom: 8,
        filter: ['all', ['==', 'class', 'state'], ['<=', 'rank', 4]],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 7, 13],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.15,
          'text-max-width': 10,
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.6)',
          'text-halo-color': 'rgba(0,0,0,0.5)',
          'text-halo-width': 1,
        },
      });
    }
  }
}

/**
 * Remove all extra label layers (and satellite-only source).
 */
function removeExtraLabels(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style) return;

  for (const layer of style.layers) {
    if (layer.id.startsWith(LAYER_PREFIX)) {
      map.removeLayer(layer.id);
    }
  }

  if (map.getSource(EXTRA_SOURCE_ID)) {
    map.removeSource(EXTRA_SOURCE_ID);
  }
}

/**
 * Manages supplementary town/village label layers on the map.
 * Listens for the showMoreLabels toggle and style.load events.
 */
export function MoreLabelsLayer() {
  const map = useMap();
  const showMoreLabels = useMapStore((s) => s.showMoreLabels);
  const baseMapStyle = useMapStore((s) => s.baseMapStyle);
  const prevShowRef = useRef(showMoreLabels);
  const prevBaseRef = useRef(baseMapStyle);

  useEffect(() => {
    if (!map) return;

    const apply = () => {
      const show = useMapStore.getState().showMoreLabels;
      const basemap = useMapStore.getState().baseMapStyle;
      try {
        if (show) {
          addExtraLabels(map, basemap);
        } else {
          removeExtraLabels(map);
        }
      } catch (err) {
        console.warn('[MoreLabelsLayer] Error applying labels:', err);
      }
    };

    // Apply on style.load (basemap change rebuilds everything)
    const onStyleLoad = () => {
      // Small delay to let the style fully settle
      setTimeout(apply, 100);
    };
    map.on('style.load', onStyleLoad);

    // Apply immediately if style is already loaded
    if (map.isStyleLoaded()) {
      apply();
    }

    return () => {
      try { map.off('style.load', onStyleLoad); } catch { /* map destroyed */ }
    };
  }, [map]);

  // React to toggle/basemap changes
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    const showChanged = showMoreLabels !== prevShowRef.current;
    const baseChanged = baseMapStyle !== prevBaseRef.current;
    prevShowRef.current = showMoreLabels;
    prevBaseRef.current = baseMapStyle;

    if (!showChanged && !baseChanged) return;

    try {
      if (showMoreLabels) {
        // Remove first to handle basemap color changes cleanly
        removeExtraLabels(map);
        addExtraLabels(map, baseMapStyle);
      } else {
        removeExtraLabels(map);
      }
    } catch (err) {
      console.warn('[MoreLabelsLayer] Error updating labels:', err);
    }
  }, [map, showMoreLabels, baseMapStyle]);

  return null;
}
