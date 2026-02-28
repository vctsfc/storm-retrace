/**
 * Storm path drawing + follow layer.
 *
 * Allows the user to draw a storm's movement path on the map by clicking
 * waypoints. Each waypoint is bound to the current timeline timestamp.
 * After finalizing, the visual markers/line disappear. When "Follow Storm"
 * is enabled, the map smoothly eases along the drawn path during playback.
 *
 * Smooth movement: uses map.easeTo() with a duration matching the playback
 * interval so the map glides continuously between positions rather than
 * jumping frame-to-frame.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useStormPathStore, type StormWaypoint } from '../../stores/stormPathStore';
import { useTimelineStore } from '../../stores/timelineStore';

const DRAW_LINE_SOURCE = 'storm-path-draw-line';
const DRAW_LINE_LAYER = 'storm-path-draw-line-layer';
const DRAW_POINTS_SOURCE = 'storm-path-draw-points';
const DRAW_POINTS_LAYER = 'storm-path-draw-points-layer';

/**
 * Interpolate position along the storm path at a given time.
 * Waypoints are sorted by timeMs. If time falls between two waypoints,
 * linearly interpolate lat/lon. Before first → first pos, after last → last pos.
 */
function interpolateStormPosition(
  waypoints: StormWaypoint[],
  timeMs: number,
): { lat: number; lon: number } | null {
  if (waypoints.length === 0) return null;
  if (waypoints.length === 1) {
    return { lat: waypoints[0].lat, lon: waypoints[0].lon };
  }

  // Before first waypoint
  if (timeMs <= waypoints[0].timeMs) {
    return { lat: waypoints[0].lat, lon: waypoints[0].lon };
  }

  // After last waypoint
  if (timeMs >= waypoints[waypoints.length - 1].timeMs) {
    const last = waypoints[waypoints.length - 1];
    return { lat: last.lat, lon: last.lon };
  }

  // Binary search for the segment
  let lo = 0;
  let hi = waypoints.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (waypoints[mid].timeMs <= timeMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = waypoints[lo];
  const b = waypoints[hi];
  const dt = b.timeMs - a.timeMs;
  if (dt <= 0) return { lat: a.lat, lon: a.lon };

  const t = (timeMs - a.timeMs) / dt;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
  };
}

/**
 * Build GeoJSON for the drawing line connecting waypoints.
 */
function buildDrawLineGeoJSON(waypoints: StormWaypoint[]): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: waypoints.map((wp) => [wp.lon, wp.lat]),
    },
  };
}

/**
 * Build GeoJSON for waypoint markers during drawing.
 */
function buildDrawPointsGeoJSON(waypoints: StormWaypoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: waypoints.map((wp, i) => ({
      type: 'Feature' as const,
      properties: { index: i },
      geometry: {
        type: 'Point' as const,
        coordinates: [wp.lon, wp.lat],
      },
    })),
  };
}

export function StormPathLayer() {
  const map = useMap();
  const drawLayersAddedRef = useRef(false);
  const easeRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;

    drawLayersAddedRef.current = false;

    /* ── Drawing layers (visible only during drawing mode) ──────── */

    const ensureDrawLayers = () => {
      if (drawLayersAddedRef.current) return;
      if (!map.isStyleLoaded()) return;

      // Line connecting waypoints
      if (!map.getSource(DRAW_LINE_SOURCE)) {
        map.addSource(DRAW_LINE_SOURCE, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
        });
      }
      if (!map.getLayer(DRAW_LINE_LAYER)) {
        map.addLayer({
          id: DRAW_LINE_LAYER,
          type: 'line',
          source: DRAW_LINE_SOURCE,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
            visibility: 'none',
          },
          paint: {
            'line-color': '#ffcc00',
            'line-width': 2.5,
            'line-opacity': 0.8,
            'line-dasharray': [4, 3],
          },
        });
      }

      // Waypoint dots
      if (!map.getSource(DRAW_POINTS_SOURCE)) {
        map.addSource(DRAW_POINTS_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer(DRAW_POINTS_LAYER)) {
        map.addLayer({
          id: DRAW_POINTS_LAYER,
          type: 'circle',
          source: DRAW_POINTS_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 6,
            'circle-color': '#ffcc00',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.9,
          },
        });
      }

      drawLayersAddedRef.current = true;
    };

    const updateDrawVisuals = () => {
      const { drawingMode, waypoints } = useStormPathStore.getState();

      if (!drawLayersAddedRef.current) return;

      if (drawingMode) {
        // Show drawing layers with current data
        map.setLayoutProperty(DRAW_LINE_LAYER, 'visibility', 'visible');
        map.setLayoutProperty(DRAW_POINTS_LAYER, 'visibility', 'visible');

        const lineSrc = map.getSource(DRAW_LINE_SOURCE);
        if (lineSrc && 'setData' in lineSrc) {
          (lineSrc as any).setData(buildDrawLineGeoJSON(waypoints));
        }

        const ptsSrc = map.getSource(DRAW_POINTS_SOURCE);
        if (ptsSrc && 'setData' in ptsSrc) {
          (ptsSrc as any).setData(buildDrawPointsGeoJSON(waypoints));
        }

        // Keep drawing layers on top
        if (map.getLayer(DRAW_LINE_LAYER)) map.moveLayer(DRAW_LINE_LAYER);
        if (map.getLayer(DRAW_POINTS_LAYER)) map.moveLayer(DRAW_POINTS_LAYER);
      } else {
        // Hide drawing layers when not drawing
        if (map.getLayer(DRAW_LINE_LAYER)) {
          map.setLayoutProperty(DRAW_LINE_LAYER, 'visibility', 'none');
        }
        if (map.getLayer(DRAW_POINTS_LAYER)) {
          map.setLayoutProperty(DRAW_POINTS_LAYER, 'visibility', 'none');
        }
      }
    };

    const removeDrawLayers = () => {
      if (map.getLayer(DRAW_LINE_LAYER)) map.removeLayer(DRAW_LINE_LAYER);
      if (map.getSource(DRAW_LINE_SOURCE)) map.removeSource(DRAW_LINE_SOURCE);
      if (map.getLayer(DRAW_POINTS_LAYER)) map.removeLayer(DRAW_POINTS_LAYER);
      if (map.getSource(DRAW_POINTS_SOURCE)) map.removeSource(DRAW_POINTS_SOURCE);
      drawLayersAddedRef.current = false;
    };

    /* ── Click handler for placing waypoints ────────────────────── */

    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const { drawingMode, addWaypoint } = useStormPathStore.getState();
      if (!drawingMode) return;

      // Prevent click from reaching other layers (e.g. site picker)
      e.preventDefault();
      (e as any).originalEvent?.stopPropagation?.();

      const { currentIndex, frameTimes } = useTimelineStore.getState();
      const timeMs = frameTimes[currentIndex] ?? 0;

      if (timeMs <= 0) return;

      addWaypoint({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
        timeMs,
      });

      // Immediately update visuals
      updateDrawVisuals();
    };

    /* ── Follow storm: smooth map movement ──────────────────────── */

    const followStormUpdate = () => {
      const { followStorm, waypoints } = useStormPathStore.getState();
      if (!followStorm || waypoints.length < 2) return;

      const { currentIndex, frameTimes, speed } = useTimelineStore.getState();
      const targetMs = frameTimes[currentIndex] ?? 0;
      if (targetMs <= 0) return;

      const pos = interpolateStormPosition(waypoints, targetMs);
      if (!pos) return;

      // Duration matches the playback interval for smooth continuous movement.
      // At 1x speed, frames advance every ~500ms → 500ms easeTo duration.
      // This creates a gliding effect rather than frame-to-frame jumps.
      const baseInterval = 500;
      const duration = Math.max(baseInterval / speed, 50);

      map.easeTo({
        center: [pos.lon, pos.lat],
        duration,
        easing: (t) => t, // linear easing for constant speed movement
      });
    };

    /* ── Cursor style during drawing ────────────────────────────── */

    const updateCursor = () => {
      const { drawingMode } = useStormPathStore.getState();
      map.getCanvas().style.cursor = drawingMode ? 'crosshair' : '';
    };

    /* ── Auto-disable follow storm on user drag ─────────────────── */

    const onDragStart = () => {
      if (useStormPathStore.getState().followStorm) {
        useStormPathStore.getState().setFollowStorm(false);
      }
    };

    /* ── Subscriptions ──────────────────────────────────────────── */

    const unsubStormPath = useStormPathStore.subscribe((state, prev) => {
      // Drawing mode changed
      if (state.drawingMode !== prev.drawingMode) {
        if (state.drawingMode) {
          ensureDrawLayers();
        }
        updateDrawVisuals();
        updateCursor();
      }

      // Waypoints changed during drawing
      if (state.drawingMode && state.waypoints !== prev.waypoints) {
        updateDrawVisuals();
      }

      // Follow storm toggled
      if (state.followStorm !== prev.followStorm) {
        if (state.followStorm) {
          followStormUpdate();
        }
      }
    });

    // Timeline subscription for follow storm
    let prevTimelineIndex = useTimelineStore.getState().currentIndex;
    const unsubTimeline = useTimelineStore.subscribe((state) => {
      if (state.currentIndex !== prevTimelineIndex) {
        prevTimelineIndex = state.currentIndex;

        if (useStormPathStore.getState().followStorm) {
          if (easeRafRef.current !== null) {
            cancelAnimationFrame(easeRafRef.current);
          }
          easeRafRef.current = requestAnimationFrame(() => {
            easeRafRef.current = null;
            followStormUpdate();
          });
        }
      }
    });

    // Style load recovery
    const onStyleLoad = () => {
      drawLayersAddedRef.current = false;
      const { drawingMode } = useStormPathStore.getState();
      if (drawingMode) {
        ensureDrawLayers();
        updateDrawVisuals();
      }
    };

    // Initialize
    ensureDrawLayers();
    updateDrawVisuals();
    updateCursor();

    map.on('click', onMapClick);
    map.on('dragstart', onDragStart);
    map.on('style.load', onStyleLoad);

    return () => {
      unsubStormPath();
      unsubTimeline();
      if (easeRafRef.current !== null) cancelAnimationFrame(easeRafRef.current);
      map.off('click', onMapClick);
      map.off('dragstart', onDragStart);
      map.off('style.load', onStyleLoad);
      map.getCanvas().style.cursor = '';
      removeDrawLayers();
    };
  }, [map]);

  return null;
}
