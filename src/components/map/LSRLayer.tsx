import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useOverlayStore, type LocalStormReport } from '../../stores/overlayStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { isMapUsable } from '../../utils/mapSafety';

const LSR_SOURCE_ID = 'lsr-reports';
const LSR_CIRCLE_LAYER_ID = 'lsr-reports-circles';
const LSR_SYMBOL_LAYER_ID = 'lsr-reports-triangles';

const TORNADO_ICON = 'lsr-tornado';
const FUNNEL_ICON = 'lsr-funnel';

/**
 * Draw an upside-down narrow triangle on a canvas and return a data URL.
 */
function createTriangleDataUrl(fillColor: string, size = 32): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const pad = 2;
  const topWidth = size * 0.55;
  const topLeft = (size - topWidth) / 2;

  ctx.beginPath();
  ctx.moveTo(topLeft, pad);
  ctx.lineTo(topLeft + topWidth, pad);
  ctx.lineTo(size / 2, size - pad);
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/**
 * Load a single icon image into the map via HTMLImageElement (most reliable addImage path).
 */
function loadIcon(map: maplibregl.Map, id: string, dataUrl: string): Promise<void> {
  if (map.hasImage(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage(id)) {
        map.addImage(id, img);
      }
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Convert LocalStormReport[] to a GeoJSON FeatureCollection for MapLibre.
 */
function lsrsToGeoJSON(lsrs: LocalStormReport[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lsrs.map((l) => ({
      type: 'Feature' as const,
      properties: {
        id: l.id,
        type: l.type,
        typetext: l.typetext,
        magnitude: l.magnitude,
        valid: l.valid,
        city: l.city,
        county: l.county,
        state: l.state,
        source: l.source,
        remark: l.remark,
      },
      geometry: l.geometry,
    })),
  };
}

function findBeforeId(map: maplibregl.Map, candidates: string[]): string | undefined {
  for (const id of candidates) {
    if (map.getLayer(id)) return id;
  }
  return undefined;
}

/** Filter: tornado (T) and funnel cloud (C) types only */
const TRIANGLE_TYPE_FILTER: any = ['any', ['==', ['get', 'type'], 'T'], ['==', ['get', 'type'], 'C']];
/** Filter: everything except tornado and funnel cloud */
const CIRCLE_TYPE_FILTER: any = ['all', ['!=', ['get', 'type'], 'T'], ['!=', ['get', 'type'], 'C']];

/**
 * Renders Local Storm Reports on the map.
 * - Tornado/Funnel: upside-down triangle icons (symbol layer)
 * - Hail/Wind/Flood/Other: colored circles (circle layer)
 * Time-synced: cumulative (reports accumulate as time advances).
 * Click popup shows report details.
 */
export function LSRLayer() {
  const map = useMap();
  const addedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!map) return;
    addedRef.current = false;

    /**
     * Add source + both layers to the map.
     * Icons are loaded asynchronously via HTMLImageElement before the symbol layer is added.
     */
    const addLayers = () => {
      if (addedRef.current) return;
      if (!map.isStyleLoaded()) {
        map.once('style.load', addLayers);
        return;
      }
      if (map.getSource(LSR_SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      // Load triangle icons first (async via HTMLImageElement), then add layers
      Promise.all([
        loadIcon(map, TORNADO_ICON, createTriangleDataUrl('#ff0000', 32)),
        loadIcon(map, FUNNEL_ICON, createTriangleDataUrl('#ff8800', 32)),
      ]).then(() => {
        // Guard: async gap — check nothing changed while loading icons
        if (addedRef.current || map.getSource(LSR_SOURCE_ID)) {
          addedRef.current = true;
          return;
        }

        const { lsrs } = useOverlayStore.getState();
        const geojson = lsrsToGeoJSON(lsrs);

        map.addSource(LSR_SOURCE_ID, {
          type: 'geojson',
          data: geojson,
        });

        const beforeId = findBeforeId(map, ['nexrad-sites-layer']);

        // Circle layer — hail, wind, flood, and other non-tornado/funnel types
        map.addLayer(
          {
            id: LSR_CIRCLE_LAYER_ID,
            type: 'circle',
            source: LSR_SOURCE_ID,
            filter: CIRCLE_TYPE_FILTER,
            paint: {
              'circle-color': [
                'match',
                ['get', 'type'],
                'H', '#00cc00',   // Hail
                'G', '#0066ff',   // Tstm Wind Gust
                'D', '#0066ff',   // Tstm Wind Dmg
                'F', '#00cccc',   // Flash Flood
                '#888888',        // Other
              ],
              'circle-radius': [
                'case',
                ['==', ['get', 'type'], 'H'],
                [
                  'interpolate', ['linear'],
                  ['coalesce', ['get', 'magnitude'], 1],
                  0.75, 5,
                  2.0, 9,
                  4.5, 15,
                ],
                ['any', ['==', ['get', 'type'], 'G'], ['==', ['get', 'type'], 'D']],
                [
                  'interpolate', ['linear'],
                  ['coalesce', ['get', 'magnitude'], 50],
                  50, 5,
                  75, 8,
                  100, 12,
                ],
                5,
              ],
              'circle-stroke-width': 1,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.85,
              'circle-stroke-opacity': 0.85,
            },
          },
          beforeId,
        );

        // Symbol layer — tornado and funnel cloud as upside-down triangles
        map.addLayer(
          {
            id: LSR_SYMBOL_LAYER_ID,
            type: 'symbol',
            source: LSR_SOURCE_ID,
            filter: TRIANGLE_TYPE_FILTER,
            layout: {
              'icon-image': [
                'match', ['get', 'type'],
                'T', TORNADO_ICON,
                'C', FUNNEL_ICON,
                TORNADO_ICON,
              ],
              'icon-size': 1,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: {
              'icon-opacity': 0.85,
            },
          },
          beforeId,
        );

        addedRef.current = true;
        applyVisibilityAndFilter();
        applyOpacity();
      }).catch((err) => {
        console.error('[LSRLayer] Failed to load triangle icons:', err);
      });
    };

    const applyOpacity = () => {
      if (!addedRef.current) return;
      if (!isMapUsable(map)) return;
      const { lsrsOpacity } = useOverlayStore.getState();
      if (map.getLayer(LSR_CIRCLE_LAYER_ID)) {
        map.setPaintProperty(LSR_CIRCLE_LAYER_ID, 'circle-opacity', 0.85 * lsrsOpacity);
        map.setPaintProperty(LSR_CIRCLE_LAYER_ID, 'circle-stroke-opacity', 0.85 * lsrsOpacity);
      }
      if (map.getLayer(LSR_SYMBOL_LAYER_ID)) {
        map.setPaintProperty(LSR_SYMBOL_LAYER_ID, 'icon-opacity', 0.85 * lsrsOpacity);
      }
    };

    const applyVisibilityAndFilter = () => {
      if (!addedRef.current) return;
      if (!isMapUsable(map)) return;

      const { lsrsVisible, lsrsTimeSynced } = useOverlayStore.getState();
      const visibility = lsrsVisible ? 'visible' : 'none';

      if (map.getLayer(LSR_CIRCLE_LAYER_ID)) {
        map.setLayoutProperty(LSR_CIRCLE_LAYER_ID, 'visibility', visibility);
      }
      if (map.getLayer(LSR_SYMBOL_LAYER_ID)) {
        map.setLayoutProperty(LSR_SYMBOL_LAYER_ID, 'visibility', visibility);
      }

      if (lsrsVisible && lsrsTimeSynced) {
        const { currentIndex, frameTimes } = useTimelineStore.getState();
        const currentTimeMs = frameTimes[currentIndex] ?? 0;
        const timeFilter: any = ['<=', ['get', 'valid'], currentTimeMs];
        if (map.getLayer(LSR_CIRCLE_LAYER_ID)) {
          map.setFilter(LSR_CIRCLE_LAYER_ID, ['all', ...CIRCLE_TYPE_FILTER.slice(1), timeFilter]);
        }
        if (map.getLayer(LSR_SYMBOL_LAYER_ID)) {
          map.setFilter(LSR_SYMBOL_LAYER_ID, ['all', TRIANGLE_TYPE_FILTER, timeFilter]);
        }
      } else {
        if (map.getLayer(LSR_CIRCLE_LAYER_ID)) map.setFilter(LSR_CIRCLE_LAYER_ID, CIRCLE_TYPE_FILTER);
        if (map.getLayer(LSR_SYMBOL_LAYER_ID)) map.setFilter(LSR_SYMBOL_LAYER_ID, TRIANGLE_TYPE_FILTER);
      }
    };

    // Click handler for popup (shared by both layers)
    const onFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const f = e.features[0];
      const p = f.properties;
      if (!p) return;

      popupRef.current?.remove();

      const mag = p.magnitude != null && p.magnitude !== '' ? p.magnitude : null;
      const typetext = p.typetext || p.type || 'Report';
      let magStr = '';
      if (mag !== null) {
        if (p.type === 'H') magStr = ` — ${mag}"`;
        else if (p.type === 'G' || p.type === 'D') magStr = ` — ${mag} kts`;
        else magStr = ` — ${mag}`;
      }

      const location = [p.city, p.county ? `${p.county} Co.` : '', p.state]
        .filter(Boolean)
        .join(', ');

      const lines = [
        `<strong>${typetext}${magStr}</strong>`,
        location ? `<div style="font-size:12px;color:#aaa">${location}</div>` : '',
        p.remark ? `<div style="font-size:11px;margin-top:4px;color:#ccc">${p.remark}</div>` : '',
        p.source ? `<div style="font-size:10px;color:#888;margin-top:2px">Source: ${p.source}</div>` : '',
      ].filter(Boolean).join('');

      const coords = (f.geometry as GeoJSON.Point).coordinates;
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '280px',
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(`<div style="color:#eee;font-size:13px">${lines}</div>`)
        .addTo(map);
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const unsubOverlay = useOverlayStore.subscribe((state, prevState) => {
      try {
        if (state.lsrs !== prevState.lsrs) {
          const source = map.getSource(LSR_SOURCE_ID);
          if (source && 'setData' in source) {
            (source as any).setData(lsrsToGeoJSON(state.lsrs));
          } else if (state.lsrs.length > 0) {
            addLayers();
          }
          applyVisibilityAndFilter();
        }

        if (
          state.lsrsVisible !== prevState.lsrsVisible ||
          state.lsrsTimeSynced !== prevState.lsrsTimeSynced
        ) {
          applyVisibilityAndFilter();
        }

        if (state.lsrsOpacity !== prevState.lsrsOpacity) {
          applyOpacity();
        }
      } catch { /* map destroyed */ }
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

    // Bind click/hover events for both layers
    const bindEvents = () => {
      if (map.getLayer(LSR_CIRCLE_LAYER_ID)) {
        map.on('click', LSR_CIRCLE_LAYER_ID, onFeatureClick);
        map.on('mouseenter', LSR_CIRCLE_LAYER_ID, onMouseEnter);
        map.on('mouseleave', LSR_CIRCLE_LAYER_ID, onMouseLeave);
      }
      if (map.getLayer(LSR_SYMBOL_LAYER_ID)) {
        map.on('click', LSR_SYMBOL_LAYER_ID, onFeatureClick);
        map.on('mouseenter', LSR_SYMBOL_LAYER_ID, onMouseEnter);
        map.on('mouseleave', LSR_SYMBOL_LAYER_ID, onMouseLeave);
      }
    };
    bindEvents();
    map.on('sourcedata', bindEvents);

    return () => {
      unsubOverlay();
      unsubTimeline();
      if (filterRafId !== null) cancelAnimationFrame(filterRafId);
      try {
        map.off('style.load', onStyleLoad);
        map.off('sourcedata', bindEvents);
        if (map.getLayer(LSR_CIRCLE_LAYER_ID)) {
          map.off('click', LSR_CIRCLE_LAYER_ID, onFeatureClick);
          map.off('mouseenter', LSR_CIRCLE_LAYER_ID, onMouseEnter);
          map.off('mouseleave', LSR_CIRCLE_LAYER_ID, onMouseLeave);
        }
        if (map.getLayer(LSR_SYMBOL_LAYER_ID)) {
          map.off('click', LSR_SYMBOL_LAYER_ID, onFeatureClick);
          map.off('mouseenter', LSR_SYMBOL_LAYER_ID, onMouseEnter);
          map.off('mouseleave', LSR_SYMBOL_LAYER_ID, onMouseLeave);
        }
      } catch { /* map destroyed */ }
      popupRef.current?.remove();
    };
  }, [map]);

  return null;
}
