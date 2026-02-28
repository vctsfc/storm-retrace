import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useOverlayStore, type NWSWarning } from '../../stores/overlayStore';
import { useTimelineStore } from '../../stores/timelineStore';

const WARNINGS_SOURCE_ID = 'nws-warnings';
const WARNINGS_FILL_LAYER_ID = 'nws-warnings-fill';
const WARNINGS_LINE_LAYER_ID = 'nws-warnings-line';

/**
 * Convert NWSWarning[] to a GeoJSON FeatureCollection for MapLibre.
 * Stores issue/expire as numeric properties for filter expression comparison.
 */
function warningsToGeoJSON(warnings: NWSWarning[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: warnings.map((w) => ({
      type: 'Feature' as const,
      properties: {
        id: w.id,
        phenomena: w.phenomena,
        issue: w.issue,
        expire: w.expire,
        is_emergency: w.is_emergency,
        is_pds: w.is_pds,
        wfo: w.wfo,
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
 * Renders NWS warning polygons on the map as fill + line layers.
 * Supports time-synced filtering via MapLibre filter expressions.
 */
export function WarningsLayer() {
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
      if (map.getSource(WARNINGS_SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      const { warnings } = useOverlayStore.getState();
      const geojson = warningsToGeoJSON(warnings);

      map.addSource(WARNINGS_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      // Insert warnings above watches but below MCDs/LSRs/sites
      const beforeId = findBeforeId(map, [
        'spc-mcds-fill',
        'lsr-reports-circles',
        'nexrad-sites-layer',
      ]);

      // Fill layer — semi-transparent colored polygons
      map.addLayer(
        {
          id: WARNINGS_FILL_LAYER_ID,
          type: 'fill',
          source: WARNINGS_SOURCE_ID,
          paint: {
            'fill-color': [
              'match', ['get', 'phenomena'],
              'TO', 'rgba(255, 0, 0, 0.25)',
              'SV', 'rgba(255, 165, 0, 0.25)',
              'FF', 'rgba(0, 255, 0, 0.25)',
              'rgba(128, 128, 128, 0.25)',
            ],
            'fill-opacity': [
              'case',
              ['get', 'is_emergency'], 0.45,
              ['get', 'is_pds'], 0.35,
              0.25,
            ],
          },
        },
        beforeId,
      );

      // Line layer — solid colored outlines (same beforeId keeps them adjacent)
      map.addLayer(
        {
          id: WARNINGS_LINE_LAYER_ID,
          type: 'line',
          source: WARNINGS_SOURCE_ID,
          paint: {
            'line-color': [
              'match', ['get', 'phenomena'],
              'TO', '#ff0000',
              'SV', '#ffa500',
              'FF', '#00ff00',
              '#808080',
            ],
            'line-width': [
              'case',
              ['get', 'is_emergency'], 3,
              ['get', 'is_pds'], 2.5,
              2,
            ],
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
      if (!addedRef.current) return;
      const { warningsOpacity } = useOverlayStore.getState();
      if (map.getLayer(WARNINGS_FILL_LAYER_ID)) {
        map.setPaintProperty(WARNINGS_FILL_LAYER_ID, 'fill-opacity', [
          '*',
          ['case', ['get', 'is_emergency'], 0.45, ['get', 'is_pds'], 0.35, 0.25],
          warningsOpacity,
        ]);
      }
      if (map.getLayer(WARNINGS_LINE_LAYER_ID)) {
        map.setPaintProperty(WARNINGS_LINE_LAYER_ID, 'line-opacity', 0.9 * warningsOpacity);
      }
    };

    /**
     * Apply current visibility and time filter based on store state.
     */
    const applyVisibilityAndFilter = () => {
      if (!addedRef.current) return;

      const { warningsVisible, warningsTimeSynced } = useOverlayStore.getState();
      const visibility = warningsVisible ? 'visible' : 'none';

      if (map.getLayer(WARNINGS_FILL_LAYER_ID)) {
        map.setLayoutProperty(WARNINGS_FILL_LAYER_ID, 'visibility', visibility);
      }
      if (map.getLayer(WARNINGS_LINE_LAYER_ID)) {
        map.setLayoutProperty(WARNINGS_LINE_LAYER_ID, 'visibility', visibility);
      }

      if (warningsVisible && warningsTimeSynced) {
        const { currentIndex, frameTimes } = useTimelineStore.getState();
        const currentTimeMs = frameTimes[currentIndex] ?? 0;
        // Show warnings where: issue <= currentTime < expire
        const filter: any = [
          'all',
          ['<=', ['get', 'issue'], currentTimeMs],
          ['>', ['get', 'expire'], currentTimeMs],
        ];
        if (map.getLayer(WARNINGS_FILL_LAYER_ID)) map.setFilter(WARNINGS_FILL_LAYER_ID, filter);
        if (map.getLayer(WARNINGS_LINE_LAYER_ID)) map.setFilter(WARNINGS_LINE_LAYER_ID, filter);
      } else {
        // Show all warnings (no time filter)
        if (map.getLayer(WARNINGS_FILL_LAYER_ID)) map.setFilter(WARNINGS_FILL_LAYER_ID, null);
        if (map.getLayer(WARNINGS_LINE_LAYER_ID)) map.setFilter(WARNINGS_LINE_LAYER_ID, null);
      }
    };

    // Subscribe to overlay store changes (warnings data, visibility, time-sync)
    const unsubOverlay = useOverlayStore.subscribe((state, prevState) => {
      // If warnings data changed, update the source
      if (state.warnings !== prevState.warnings) {
        const source = map.getSource(WARNINGS_SOURCE_ID);
        if (source && 'setData' in source) {
          (source as any).setData(warningsToGeoJSON(state.warnings));
        } else if (state.warnings.length > 0) {
          addLayers();
        }
        applyVisibilityAndFilter();
      }

      // If visibility or time-sync changed
      if (
        state.warningsVisible !== prevState.warningsVisible ||
        state.warningsTimeSynced !== prevState.warningsTimeSynced
      ) {
        applyVisibilityAndFilter();
      }

      if (state.warningsOpacity !== prevState.warningsOpacity) {
        applyOpacity();
      }
    });

    // Subscribe to timeline changes for time-synced filtering (rAF-batched)
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

    // Re-add layers when style changes
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
      map.off('style.load', onStyleLoad);
    };
  }, [map]);

  return null;
}
