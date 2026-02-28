import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useOverlayStore } from '../../stores/overlayStore';
import { isMapUsable } from '../../utils/mapSafety';

const SOURCE_ID = 'tornado-tracks';
const CASING_LAYER_ID = 'tornado-tracks-casing';
const LINE_LAYER_ID = 'tornado-tracks-line';

/**
 * EF color scale — standard SPC/NWS convention.
 * MapLibre match expression: [match, property, ...pairs, fallback]
 */
const EF_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'efRating'],
  'EF0', '#00bbff',
  'EF1', '#00dd00',
  'EF2', '#ffff00',
  'EF3', '#ff8800',
  'EF4', '#ff0000',
  'EF5', '#ff00ff',
  'EFU', '#00bbff',
  '#aaaaaa', // fallback for unknown
];

/**
 * Line width varies by EF rating for visual hierarchy.
 */
const EF_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'efRating'],
  'EF0', 2,
  'EF1', 2,
  'EF2', 3.5,
  'EF3', 3.5,
  'EF4', 5,
  'EF5', 5,
  'EFU', 2,
  2, // fallback
];

/**
 * Casing width = line width + 2 for contrast against map.
 */
const EF_CASING_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'efRating'],
  'EF0', 4,
  'EF1', 4,
  'EF2', 5.5,
  'EF3', 5.5,
  'EF4', 7,
  'EF5', 7,
  'EFU', 4,
  4,
];

/**
 * Extract a normalized EF rating string from DAT feature properties.
 * The DAT API uses various field names; we normalize to "EF0"–"EF5" or "EFU".
 */
function normalizeEFRating(props: Record<string, any>): string {
  // Try common field names from NWS DAT
  const raw = props.efRating ?? props.ef_rating ?? props.EFRating
    ?? props.magnitude ?? props.mag ?? props.tor_f_scale ?? '';
  const s = String(raw).toUpperCase().trim();

  // Already in "EF0"–"EF5" format
  if (/^EF[0-5U]$/.test(s)) return s;

  // Just a number: 0–5
  if (/^[0-5]$/.test(s)) return `EF${s}`;

  // "F0"–"F5" (legacy Fujita)
  if (/^F[0-5]$/.test(s)) return `E${s}`;

  return 'EFU'; // Unknown
}

/**
 * Pre-process GeoJSON features from DAT to ensure consistent property names.
 */
function preprocessFeatures(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        efRating: normalizeEFRating(f.properties ?? {}),
      },
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
 * Renders NWS tornado damage survey tracks as color-coded lines on the map.
 * EF rating determines color and width. Click for details popup.
 * No time-sync — tracks are static post-event survey data.
 */
export function TornadoTracksLayer() {
  const map = useMap();
  const addedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!map) return;
    addedRef.current = false;

    const addLayers = () => {
      if (addedRef.current) return;
      if (!map.isStyleLoaded()) {
        map.once('style.load', addLayers);
        return;
      }
      if (map.getSource(SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      const { tornadoTracks } = useOverlayStore.getState();
      const geojson = tornadoTracks ? preprocessFeatures(tornadoTracks) : {
        type: 'FeatureCollection' as const,
        features: [],
      };

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      // Insert above radar but below watches/warnings
      const beforeId = findBeforeId(map, [
        'spc-watches-fill',
        'nws-warnings-fill',
        'spc-mcds-fill',
        'lsr-reports-circles',
      ]);

      // Black casing layer for contrast
      map.addLayer(
        {
          id: CASING_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': '#000000',
            'line-width': EF_CASING_WIDTH_EXPR,
            'line-opacity': 0.8,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
        },
        beforeId,
      );

      // Colored line layer
      map.addLayer(
        {
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': EF_COLOR_EXPR,
            'line-width': EF_WIDTH_EXPR,
            'line-opacity': 1.0,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
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
      const { tornadoTracksOpacity } = useOverlayStore.getState();
      if (map.getLayer(CASING_LAYER_ID)) {
        map.setPaintProperty(CASING_LAYER_ID, 'line-opacity', 0.8 * tornadoTracksOpacity);
      }
      if (map.getLayer(LINE_LAYER_ID)) {
        map.setPaintProperty(LINE_LAYER_ID, 'line-opacity', 1.0 * tornadoTracksOpacity);
      }
    };

    const applyVisibility = () => {
      if (!addedRef.current || !isMapUsable(map)) return;
      const { tornadoTracksVisible } = useOverlayStore.getState();
      const visibility = tornadoTracksVisible ? 'visible' : 'none';
      if (map.getLayer(CASING_LAYER_ID)) {
        map.setLayoutProperty(CASING_LAYER_ID, 'visibility', visibility);
      }
      if (map.getLayer(LINE_LAYER_ID)) {
        map.setLayoutProperty(LINE_LAYER_ID, 'visibility', visibility);
      }
    };

    // Click handler for popup
    const onFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const f = e.features[0];
      const p = f.properties;
      if (!p) return;

      popupRef.current?.remove();

      const efRating = p.efRating || 'Unknown';
      const location = p.Location || p.location || p.event_location || '';
      const date = p.Survey_Start_Date || p.survey_date || p.date || '';
      const pathLength = p.Path_Length || p.pathLength || p.path_length || '';
      const pathWidth = p.Path_Width || p.pathWidth || p.path_width || '';

      // Format date if it looks like a timestamp
      let dateStr = '';
      if (date) {
        const ms = typeof date === 'number' ? date : Date.parse(date);
        if (!isNaN(ms)) {
          dateStr = new Date(ms).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
        } else {
          dateStr = String(date);
        }
      }

      const efColor = getEFColor(efRating);
      const lines = [
        `<strong style="color:${efColor};font-size:14px">${efRating} Tornado</strong>`,
        location ? `<div style="font-size:12px;color:#ccc;margin-top:2px">${location}</div>` : '',
        dateStr ? `<div style="font-size:11px;color:#aaa;margin-top:4px">Survey: ${dateStr}</div>` : '',
        pathLength ? `<div style="font-size:11px;color:#aaa">Path: ${pathLength} mi</div>` : '',
        pathWidth ? `<div style="font-size:11px;color:#aaa">Width: ${pathWidth} yds</div>` : '',
      ].filter(Boolean).join('');

      // Get coordinates from the line geometry (use midpoint)
      const lngLat = e.lngLat;
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '260px',
      })
        .setLngLat(lngLat)
        .setHTML(`<div style="color:#eee;font-size:13px">${lines}</div>`)
        .addTo(map);
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    // Subscribe to overlay store changes
    const unsubOverlay = useOverlayStore.subscribe((state, prevState) => {
      try {
        if (state.tornadoTracks !== prevState.tornadoTracks) {
          const source = map.getSource(SOURCE_ID);
          const data = state.tornadoTracks
            ? preprocessFeatures(state.tornadoTracks)
            : { type: 'FeatureCollection' as const, features: [] };

          if (source && 'setData' in source) {
            (source as any).setData(data);
          } else if (state.tornadoTracks && state.tornadoTracks.features.length > 0) {
            addLayers();
          }
          applyVisibility();
        }

        if (state.tornadoTracksVisible !== prevState.tornadoTracksVisible) {
          applyVisibility();
        }

        if (state.tornadoTracksOpacity !== prevState.tornadoTracksOpacity) {
          applyOpacity();
        }
      } catch { /* map destroyed */ }
    });

    // Re-add layers when style changes
    const onStyleLoad = () => {
      addedRef.current = false;
      addLayers();
    };

    addLayers();
    map.on('style.load', onStyleLoad);

    // Bind click/hover events
    const bindEvents = () => {
      if (map.getLayer(LINE_LAYER_ID)) {
        map.on('click', LINE_LAYER_ID, onFeatureClick);
        map.on('mouseenter', LINE_LAYER_ID, onMouseEnter);
        map.on('mouseleave', LINE_LAYER_ID, onMouseLeave);
      }
    };
    bindEvents();
    map.on('sourcedata', bindEvents);

    return () => {
      unsubOverlay();
      try {
        map.off('style.load', onStyleLoad);
        map.off('sourcedata', bindEvents);
        if (map.getLayer(LINE_LAYER_ID)) {
          map.off('click', LINE_LAYER_ID, onFeatureClick);
          map.off('mouseenter', LINE_LAYER_ID, onMouseEnter);
          map.off('mouseleave', LINE_LAYER_ID, onMouseLeave);
        }
      } catch { /* map destroyed */ }
      popupRef.current?.remove();
    };
  }, [map]);

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getEFColor(rating: string): string {
  switch (rating) {
    case 'EF0': return '#00bbff';
    case 'EF1': return '#00dd00';
    case 'EF2': return '#ffff00';
    case 'EF3': return '#ff8800';
    case 'EF4': return '#ff0000';
    case 'EF5': return '#ff00ff';
    default: return '#aaaaaa';
  }
}
