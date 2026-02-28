import { useEffect, useRef } from 'react';
import { useMap } from './MapContext';
import { useOverlayStore, type SPCWatch } from '../../stores/overlayStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { isMapUsable } from '../../utils/mapSafety';

const WATCHES_SOURCE_ID = 'spc-watches';
const WATCHES_FILL_LAYER_ID = 'spc-watches-fill';
const WATCHES_LINE_LAYER_ID = 'spc-watches-line';

/**
 * Convert SPCWatch[] to a GeoJSON FeatureCollection for MapLibre.
 */
function watchesToGeoJSON(watches: SPCWatch[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: watches.map((w) => ({
      type: 'Feature' as const,
      properties: {
        id: w.id,
        type: w.type,
        issue: w.issue,
        expire: w.expire,
        is_pds: w.is_pds,
      },
      geometry: w.geometry,
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
 * Renders SPC watch polygons on the map as fill + dashed line layers.
 * Tornado Watch = red, Severe Watch = blue. Time-synced with radar.
 */
export function WatchesLayer() {
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
      if (map.getSource(WATCHES_SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      const { watches } = useOverlayStore.getState();
      const geojson = watchesToGeoJSON(watches);

      map.addSource(WATCHES_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      const beforeId = findBeforeId(map, [
        'nws-warnings-fill',
        'spc-mcds-fill',
        'lsr-reports-circles',
        'nexrad-sites-layer',
      ]);

      // Fill layer — semi-transparent colored polygons
      map.addLayer(
        {
          id: WATCHES_FILL_LAYER_ID,
          type: 'fill',
          source: WATCHES_SOURCE_ID,
          paint: {
            'fill-color': [
              'match',
              ['get', 'type'],
              'TOR', 'rgba(255, 0, 0, 0.15)',
              'SVR', 'rgba(0, 0, 255, 0.15)',
              'rgba(128, 128, 128, 0.15)',
            ],
            'fill-opacity': [
              'case',
              ['get', 'is_pds'], 0.25,
              0.15,
            ],
          },
        },
        beforeId,
      );

      // Line layer — dashed colored outlines to distinguish from warnings
      map.addLayer(
        {
          id: WATCHES_LINE_LAYER_ID,
          type: 'line',
          source: WATCHES_SOURCE_ID,
          paint: {
            'line-color': [
              'match',
              ['get', 'type'],
              'TOR', '#ff0000',
              'SVR', '#0000ff',
              '#808080',
            ],
            'line-width': [
              'case',
              ['get', 'is_pds'], 3,
              2,
            ],
            'line-dasharray': [4, 2],
            'line-opacity': 0.9,
          },
        },
        beforeId,
      );

      addedRef.current = true;
      applyVisibilityAndFilter();
      applyOpacity();
    };

    const applyOpacity = () => {
      if (!addedRef.current || !isMapUsable(map)) return;
      const { watchesOpacity } = useOverlayStore.getState();
      if (map.getLayer(WATCHES_FILL_LAYER_ID)) {
        map.setPaintProperty(WATCHES_FILL_LAYER_ID, 'fill-opacity', [
          '*',
          ['case', ['get', 'is_pds'], 0.25, 0.15],
          watchesOpacity,
        ]);
      }
      if (map.getLayer(WATCHES_LINE_LAYER_ID)) {
        map.setPaintProperty(WATCHES_LINE_LAYER_ID, 'line-opacity', 0.9 * watchesOpacity);
      }
    };

    const applyVisibilityAndFilter = () => {
      if (!addedRef.current || !isMapUsable(map)) return;

      const { watchesVisible, watchesTimeSynced } = useOverlayStore.getState();
      const visibility = watchesVisible ? 'visible' : 'none';

      if (map.getLayer(WATCHES_FILL_LAYER_ID)) {
        map.setLayoutProperty(WATCHES_FILL_LAYER_ID, 'visibility', visibility);
      }
      if (map.getLayer(WATCHES_LINE_LAYER_ID)) {
        map.setLayoutProperty(WATCHES_LINE_LAYER_ID, 'visibility', visibility);
      }

      if (watchesVisible && watchesTimeSynced) {
        const { currentIndex, frameTimes } = useTimelineStore.getState();
        const currentTimeMs = frameTimes[currentIndex] ?? 0;
        const filter: any = [
          'all',
          ['<=', ['get', 'issue'], currentTimeMs],
          ['>', ['get', 'expire'], currentTimeMs],
        ];
        if (map.getLayer(WATCHES_FILL_LAYER_ID)) map.setFilter(WATCHES_FILL_LAYER_ID, filter);
        if (map.getLayer(WATCHES_LINE_LAYER_ID)) map.setFilter(WATCHES_LINE_LAYER_ID, filter);
      } else {
        if (map.getLayer(WATCHES_FILL_LAYER_ID)) map.setFilter(WATCHES_FILL_LAYER_ID, null);
        if (map.getLayer(WATCHES_LINE_LAYER_ID)) map.setFilter(WATCHES_LINE_LAYER_ID, null);
      }
    };

    const unsubOverlay = useOverlayStore.subscribe((state, prevState) => {
      if (state.watches !== prevState.watches) {
        const source = map.getSource(WATCHES_SOURCE_ID);
        if (source && 'setData' in source) {
          (source as any).setData(watchesToGeoJSON(state.watches));
        } else if (state.watches.length > 0) {
          addLayers();
        }
        applyVisibilityAndFilter();
      }

      if (
        state.watchesVisible !== prevState.watchesVisible ||
        state.watchesTimeSynced !== prevState.watchesTimeSynced
      ) {
        applyVisibilityAndFilter();
      }

      if (state.watchesOpacity !== prevState.watchesOpacity) {
        applyOpacity();
      }
    });

    let prevTimelineIndex = useTimelineStore.getState().currentIndex;
    let filterRafId: number | null = null;
    const unsubTimeline = useTimelineStore.subscribe((state) => {
      if (state.currentIndex !== prevTimelineIndex) {
        prevTimelineIndex = state.currentIndex;
        if (filterRafId === null) {
          filterRafId = requestAnimationFrame(() => {
            filterRafId = null;
            applyVisibilityAndFilter();
          });
        }
      }
    });

    const onStyleLoad = () => {
      addedRef.current = false;
      addLayers();
    };

    addLayers();
    map.on('style.load', onStyleLoad);

    return () => {
      unsubOverlay();
      unsubTimeline();
      if (filterRafId !== null) cancelAnimationFrame(filterRafId);
      try { map.off('style.load', onStyleLoad); } catch { /* map destroyed */ }
    };
  }, [map]);

  return null;
}
