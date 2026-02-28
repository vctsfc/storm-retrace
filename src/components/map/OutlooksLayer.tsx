import { useEffect, useRef } from 'react';
import { useMap } from './MapContext';
import { useOverlayStore, type ConvectiveOutlook } from '../../stores/overlayStore';
import { isMapUsable } from '../../utils/mapSafety';

const OUTLOOK_SOURCE_ID = 'spc-outlooks';
const OUTLOOK_FILL_LAYER_ID = 'spc-outlooks-fill';

/**
 * Convert ConvectiveOutlook[] to a GeoJSON FeatureCollection for MapLibre.
 */
function outlooksToGeoJSON(outlooks: ConvectiveOutlook[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: outlooks.map((o) => ({
      type: 'Feature' as const,
      properties: {
        id: o.id,
        threshold: o.threshold,
      },
      geometry: o.geometry,
    })),
  };
}

function findBeforeId(map: maplibregl.Map, candidates: string[]): string | undefined {
  for (const id of candidates) {
    if (map.getLayer(id)) return id;
  }
  return undefined;
}

/**
 * Renders SPC convective outlook polygons as a subtle fill layer BELOW radar.
 * No time-sync — outlooks are static background context for the event.
 */
export function OutlooksLayer() {
  const map = useMap();
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    addedRef.current = false;

    const addLayers = () => {
      if (addedRef.current) return;
      if (!map.isStyleLoaded()) {
        map.once('style.load', addLayers);
        return;
      }
      if (map.getSource(OUTLOOK_SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      const { outlooks } = useOverlayStore.getState();
      const geojson = outlooksToGeoJSON(outlooks);

      map.addSource(OUTLOOK_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      // Insert below radar and all other overlay layers
      const beforeId = findBeforeId(map, [
        'radar-layer',
        'spc-watches-fill',
        'nws-warnings-fill',
        'spc-mcds-fill',
        'lsr-reports-circles',
        'nexrad-sites-layer',
      ]);

      map.addLayer(
        {
          id: OUTLOOK_FILL_LAYER_ID,
          type: 'fill',
          source: OUTLOOK_SOURCE_ID,
          paint: {
            'fill-color': [
              'match',
              ['get', 'threshold'],
              'TSTM', '#c0e8c0',
              'MRGL', '#00c000',
              'SLGT', '#ffff00',
              'ENH', '#ffa500',
              'MDT', '#ff0000',
              'HIGH', '#ff00ff',
              '#808080',
            ],
            'fill-opacity': 0.2,
          },
        },
        beforeId,
      );

      addedRef.current = true;
      applyVisibility();
      applyOpacity();
    };

    const applyOpacity = () => {
      if (!addedRef.current || !isMapUsable(map)) return;
      const { outlooksOpacity } = useOverlayStore.getState();
      if (map.getLayer(OUTLOOK_FILL_LAYER_ID)) {
        map.setPaintProperty(OUTLOOK_FILL_LAYER_ID, 'fill-opacity', 0.2 * outlooksOpacity);
      }
    };

    const applyVisibility = () => {
      if (!addedRef.current || !isMapUsable(map)) return;
      const { outlooksVisible } = useOverlayStore.getState();
      const visibility = outlooksVisible ? 'visible' : 'none';
      if (map.getLayer(OUTLOOK_FILL_LAYER_ID)) {
        map.setLayoutProperty(OUTLOOK_FILL_LAYER_ID, 'visibility', visibility);
      }
    };

    // Subscribe to overlay store changes
    const unsubOverlay = useOverlayStore.subscribe((state, prevState) => {
      if (state.outlooks !== prevState.outlooks) {
        const source = map.getSource(OUTLOOK_SOURCE_ID);
        if (source && 'setData' in source) {
          (source as any).setData(outlooksToGeoJSON(state.outlooks));
        } else if (state.outlooks.length > 0) {
          addLayers();
        }
        applyVisibility();
      }

      if (state.outlooksVisible !== prevState.outlooksVisible) {
        applyVisibility();
      }

      if (state.outlooksOpacity !== prevState.outlooksOpacity) {
        applyOpacity();
      }
    });

    // Re-add layers when style changes
    const onStyleLoad = () => {
      addedRef.current = false;
      addLayers();
    };

    addLayers();
    map.on('style.load', onStyleLoad);

    return () => {
      unsubOverlay();
      try { map.off('style.load', onStyleLoad); } catch { /* map destroyed */ }
    };
  }, [map]);

  return null;
}
