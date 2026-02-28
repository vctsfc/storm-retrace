import { useEffect, useRef } from 'react';
import { useMap } from './MapContext';
import { useOverlayStore, type MesoscaleDiscussion } from '../../stores/overlayStore';
import { useTimelineStore } from '../../stores/timelineStore';

const MCD_SOURCE_ID = 'spc-mcds';
const MCD_FILL_LAYER_ID = 'spc-mcds-fill';
const MCD_LINE_LAYER_ID = 'spc-mcds-line';

/**
 * Convert MesoscaleDiscussion[] to a GeoJSON FeatureCollection for MapLibre.
 */
function mcdsToGeoJSON(mcds: MesoscaleDiscussion[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: mcds.map((m) => ({
      type: 'Feature' as const,
      properties: {
        id: m.id,
        num: m.num,
        issue: m.issue,
        expire: m.expire,
        watch_confidence: m.watch_confidence,
        concerning: m.concerning,
      },
      geometry: m.geometry,
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
 * Renders SPC Mesoscale Discussion polygons on the map as gold fill + line layers.
 * Time-synced with radar.
 */
export function MCDLayer() {
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
      if (map.getSource(MCD_SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      const { mcds } = useOverlayStore.getState();
      const geojson = mcdsToGeoJSON(mcds);

      map.addSource(MCD_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      const beforeId = findBeforeId(map, [
        'lsr-reports-circles',
        'nexrad-sites-layer',
      ]);

      // Fill layer — subtle gold
      map.addLayer(
        {
          id: MCD_FILL_LAYER_ID,
          type: 'fill',
          source: MCD_SOURCE_ID,
          paint: {
            'fill-color': 'rgba(255, 204, 0, 0.15)',
            'fill-opacity': 0.15,
          },
        },
        beforeId,
      );

      // Line layer — gold outline
      map.addLayer(
        {
          id: MCD_LINE_LAYER_ID,
          type: 'line',
          source: MCD_SOURCE_ID,
          paint: {
            'line-color': '#ffcc00',
            'line-width': 2,
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
      const { mcdsOpacity } = useOverlayStore.getState();
      if (map.getLayer(MCD_FILL_LAYER_ID)) {
        map.setPaintProperty(MCD_FILL_LAYER_ID, 'fill-opacity', 0.15 * mcdsOpacity);
      }
      if (map.getLayer(MCD_LINE_LAYER_ID)) {
        map.setPaintProperty(MCD_LINE_LAYER_ID, 'line-opacity', 0.9 * mcdsOpacity);
      }
    };

    const applyVisibilityAndFilter = () => {
      if (!addedRef.current) return;

      const { mcdsVisible, mcdsTimeSynced } = useOverlayStore.getState();
      const visibility = mcdsVisible ? 'visible' : 'none';

      if (map.getLayer(MCD_FILL_LAYER_ID)) {
        map.setLayoutProperty(MCD_FILL_LAYER_ID, 'visibility', visibility);
      }
      if (map.getLayer(MCD_LINE_LAYER_ID)) {
        map.setLayoutProperty(MCD_LINE_LAYER_ID, 'visibility', visibility);
      }

      if (mcdsVisible && mcdsTimeSynced) {
        const { currentIndex, frameTimes } = useTimelineStore.getState();
        const currentTimeMs = frameTimes[currentIndex] ?? 0;
        const filter: any = [
          'all',
          ['<=', ['get', 'issue'], currentTimeMs],
          ['>', ['get', 'expire'], currentTimeMs],
        ];
        if (map.getLayer(MCD_FILL_LAYER_ID)) map.setFilter(MCD_FILL_LAYER_ID, filter);
        if (map.getLayer(MCD_LINE_LAYER_ID)) map.setFilter(MCD_LINE_LAYER_ID, filter);
      } else {
        if (map.getLayer(MCD_FILL_LAYER_ID)) map.setFilter(MCD_FILL_LAYER_ID, null);
        if (map.getLayer(MCD_LINE_LAYER_ID)) map.setFilter(MCD_LINE_LAYER_ID, null);
      }
    };

    const unsubOverlay = useOverlayStore.subscribe((state, prevState) => {
      if (state.mcds !== prevState.mcds) {
        const source = map.getSource(MCD_SOURCE_ID);
        if (source && 'setData' in source) {
          (source as any).setData(mcdsToGeoJSON(state.mcds));
        } else if (state.mcds.length > 0) {
          addLayers();
        }
        applyVisibilityAndFilter();
      }

      if (
        state.mcdsVisible !== prevState.mcdsVisible ||
        state.mcdsTimeSynced !== prevState.mcdsTimeSynced
      ) {
        applyVisibilityAndFilter();
      }

      if (state.mcdsOpacity !== prevState.mcdsOpacity) {
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
      map.off('style.load', onStyleLoad);
    };
  }, [map]);

  return null;
}
