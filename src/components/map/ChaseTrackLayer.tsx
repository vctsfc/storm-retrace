/**
 * Chase track layer.
 *
 * Renders imported GPS chase tracks on the map:
 * - Breadcrumb trail line per track (shows path traveled up to current time)
 * - Navigation arrow marker (rotated to show heading from movement data)
 *
 * Time-synced: position marker and trail interpolated to currentRadarTime via
 * binary search + linear interpolation between track points.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useTrackStore, type ChaseTrack } from '../../stores/trackStore';
import { useTimelineStore } from '../../stores/timelineStore';
import type { TrackPoint } from '../../services/gps/gpxParser';

const POSITION_SOURCE_ID = 'chase-track-positions';
const POSITION_LAYER_ID = 'chase-track-pos';
const ARROW_IMAGE_ID = 'chase-arrow';

function trackLineSourceId(trackId: string): string {
  return `chase-track-line-${trackId}`;
}

function trackLineLayerId(trackId: string): string {
  return `chase-track-line-layer-${trackId}`;
}

const EMPTY_LINE_GEOJSON: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [] },
};

/**
 * Binary search for the last track point where time <= targetMs.
 * Returns the index, or -1 if targetMs is before first point.
 */
function findPointIndex(points: TrackPoint[], targetMs: number): number {
  if (points.length === 0) return -1;
  if (targetMs < points[0].time) return -1;
  if (targetMs >= points[points.length - 1].time) return points.length - 1;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (points[mid].time <= targetMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * Interpolate position at targetMs between two track points.
 */
function interpolatePosition(
  points: TrackPoint[],
  targetMs: number,
): { lat: number; lon: number } | null {
  if (points.length === 0) return null;

  const idx = findPointIndex(points, targetMs);

  // Before track start
  if (idx === -1) {
    return { lat: points[0].lat, lon: points[0].lon };
  }

  // At or after track end
  if (idx >= points.length - 1) {
    const last = points[points.length - 1];
    return { lat: last.lat, lon: last.lon };
  }

  // Interpolate between idx and idx+1
  const a = points[idx];
  const b = points[idx + 1];
  const dt = b.time - a.time;
  if (dt <= 0) return { lat: a.lat, lon: a.lon };

  const t = (targetMs - a.time) / dt;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
  };
}

/**
 * Calculate bearing (heading) in degrees from movement between two points.
 * Uses the standard geodesic bearing formula.
 * Returns 0-360, where 0 = north, 90 = east, etc.
 */
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) * (180 / Math.PI);
  return (bearing + 360) % 360;
}

/**
 * Calculate heading at the current time from GPS track movement.
 * Uses nearby track points to determine direction of travel.
 */
function calculateHeading(points: TrackPoint[], targetMs: number): number {
  if (points.length < 2) return 0;

  const idx = findPointIndex(points, targetMs);

  // Before track start — use heading of first segment
  if (idx <= 0) {
    return calculateBearing(
      points[0].lat, points[0].lon,
      points[1].lat, points[1].lon,
    );
  }

  // At or after track end — use heading of last segment
  if (idx >= points.length - 1) {
    const n = points.length;
    return calculateBearing(
      points[n - 2].lat, points[n - 2].lon,
      points[n - 1].lat, points[n - 1].lon,
    );
  }

  // Normal case — use bearing from current point to next point
  return calculateBearing(
    points[idx].lat, points[idx].lon,
    points[idx + 1].lat, points[idx + 1].lon,
  );
}

/**
 * Build a GeoJSON LineString for the breadcrumb trail (track up to current time).
 * Includes all points up to the current time plus the interpolated current position.
 */
function buildTrailGeoJSON(track: ChaseTrack, targetMs: number): GeoJSON.Feature {
  const { points } = track;
  if (points.length === 0 || targetMs <= 0) {
    return EMPTY_LINE_GEOJSON;
  }

  const idx = findPointIndex(points, targetMs);

  // Before track start — no trail yet
  if (idx < 0) {
    return EMPTY_LINE_GEOJSON;
  }

  // All points up to and including idx
  const coords: number[][] = [];
  for (let i = 0; i <= idx; i++) {
    coords.push([points[i].lon, points[i].lat]);
  }

  // Add interpolated current position if between points
  if (idx < points.length - 1) {
    const pos = interpolatePosition(points, targetMs);
    if (pos) {
      coords.push([pos.lon, pos.lat]);
    }
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  };
}

/**
 * Build a GeoJSON FeatureCollection of position markers with heading for all visible tracks.
 */
function buildPositionGeoJSON(
  tracks: ChaseTrack[],
  targetMs: number,
  tracksVisible: boolean,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  if (!tracksVisible || targetMs <= 0) return { type: 'FeatureCollection', features };

  for (const track of tracks) {
    if (!track.visible) continue;
    const pos = interpolatePosition(track.points, targetMs);
    if (!pos) continue;

    const heading = calculateHeading(track.points, targetMs);

    features.push({
      type: 'Feature',
      properties: {
        trackId: track.id,
        color: track.color,
        name: track.name,
        heading,
      },
      geometry: {
        type: 'Point',
        coordinates: [pos.lon, pos.lat],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Create and register the navigation arrow SDF icon with MapLibre.
 * The arrow is drawn white on transparent, added with sdf: true so
 * MapLibre can tint it per-feature using icon-color.
 */
function ensureArrowIcon(map: maplibregl.Map): void {
  if (map.hasImage(ARROW_IMAGE_ID)) return;

  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Navigation arrow pointing up (north = 0 degrees)
  // Classic chevron/arrow shape
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size / 2, 3);             // Top point
  ctx.lineTo(size - 6, size - 6);      // Bottom right
  ctx.lineTo(size / 2, size - 14);     // Center notch
  ctx.lineTo(6, size - 6);             // Bottom left
  ctx.closePath();
  ctx.fill();

  // Thick white stroke for visibility
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Pass raw pixel data with explicit dimensions (avoids MapLibre canvas SDF size mismatch)
  const imageData = ctx.getImageData(0, 0, size, size);
  map.addImage(
    ARROW_IMAGE_ID,
    { width: size, height: size, data: new Uint8Array(imageData.data.buffer) },
    { sdf: true },
  );
}

export function ChaseTrackLayer() {
  const map = useMap();
  const addedTrackIdsRef = useRef<Set<string>>(new Set());
  const positionLayerAddedRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    addedTrackIdsRef.current = new Set();
    positionLayerAddedRef.current = false;

    /* ── Position arrow (symbol layer) ────────────────────────── */

    const ensurePositionLayer = () => {
      if (positionLayerAddedRef.current) return;
      if (!map.isStyleLoaded()) return;
      if (map.getSource(POSITION_SOURCE_ID)) {
        positionLayerAddedRef.current = true;
        return;
      }

      ensureArrowIcon(map);

      map.addSource(POSITION_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // No beforeId → absolute top of the layer stack
      map.addLayer({
        id: POSITION_LAYER_ID,
        type: 'symbol',
        source: POSITION_SOURCE_ID,
        layout: {
          'icon-image': ARROW_IMAGE_ID,
          'icon-size': 0.55,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': ['get', 'color'],
          'icon-halo-color': '#000000',
          'icon-halo-width': 2.5,
          'icon-opacity': 1,
        },
      });

      positionLayerAddedRef.current = true;
    };

    /* ── Breadcrumb trail (line layer per track) ──────────────── */

    const addTrackLine = (track: ChaseTrack) => {
      const srcId = trackLineSourceId(track.id);
      const layId = trackLineLayerId(track.id);

      // Guard: skip if source already exists
      if (map.getSource(srcId)) {
        if (!map.getLayer(layId)) {
          map.removeSource(srcId);
        } else {
          addedTrackIdsRef.current.add(track.id);
          return;
        }
      }

      // Note: do NOT check map.isStyleLoaded() here — MapLibre temporarily
      // returns false after ensurePositionLayer's addLayer() call, even though
      // adding sources/layers still works. The check in syncTracks() is sufficient.

      try {
        // Source starts with empty data; updated dynamically each frame
        map.addSource(srcId, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
        });

        map.addLayer({
          id: layId,
          type: 'line',
          source: srcId,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': track.color,
            'line-width': 3.5,
            'line-opacity': 0.9,
          },
        });

        addedTrackIdsRef.current.add(track.id);
      } catch (err) {
        console.error('[ChaseTrack] Failed to create trail line:', err);
      }
    };

    const removeTrackLine = (trackId: string) => {
      const srcId = trackLineSourceId(trackId);
      const layId = trackLineLayerId(trackId);
      if (map.getLayer(layId)) map.removeLayer(layId);
      if (map.getSource(srcId)) map.removeSource(srcId);
      addedTrackIdsRef.current.delete(trackId);
    };

    /* ── Layer ordering ───────────────────────────────────────── */

    const ensureLayerOrder = () => {
      // Move trail lines above all data layers, position arrow on absolute top
      for (const id of addedTrackIdsRef.current) {
        const layId = trackLineLayerId(id);
        if (map.getLayer(layId)) map.moveLayer(layId);
      }
      if (map.getLayer(POSITION_LAYER_ID)) map.moveLayer(POSITION_LAYER_ID);
    };

    /* ── Per-frame update ─────────────────────────────────────── */

    const updatePositionsAndTrails = () => {
      if (!positionLayerAddedRef.current) return;

      const { tracks, tracksVisible, tracksOpacity, showTrail, followTrack } = useTrackStore.getState();
      const { currentIndex, frameTimes } = useTimelineStore.getState();
      const targetMs = frameTimes[currentIndex] ?? 0;

      // Keep chase layers on top
      ensureLayerOrder();

      // ── Arrow position markers ──
      const posSource = map.getSource(POSITION_SOURCE_ID);
      if (posSource && 'setData' in posSource) {
        const geojson = buildPositionGeoJSON(tracks, targetMs, tracksVisible);
        (posSource as any).setData(geojson);
      }

      if (map.getLayer(POSITION_LAYER_ID)) {
        map.setPaintProperty(POSITION_LAYER_ID, 'icon-opacity', tracksOpacity);
      }

      // ── Follow chaser ──
      // Duration matches the playback interval for smooth continuous movement.
      // At 1x speed, frames advance every ~500ms → 500ms easeTo duration.
      // Linear easing gives constant-speed gliding rather than jumpy snapping.
      if (followTrack && tracksVisible && targetMs > 0) {
        const firstVisible = tracks.find((t) => t.visible);
        if (firstVisible) {
          const pos = interpolatePosition(firstVisible.points, targetMs);
          if (pos) {
            const { speed } = useTimelineStore.getState();
            const baseInterval = 500;
            const duration = Math.max(baseInterval / speed, 50);
            map.easeTo({
              center: [pos.lon, pos.lat],
              duration,
              easing: (t) => t, // linear easing for constant speed
            });
          }
        }
      }

      // ── Breadcrumb trail lines ──
      for (const track of tracks) {
        if (!track.visible || !tracksVisible) continue;

        const srcId = trackLineSourceId(track.id);
        const src = map.getSource(srcId);
        if (!src || !('setData' in src)) continue;

        if (showTrail && targetMs > 0) {
          const trailData = buildTrailGeoJSON(track, targetMs);
          (src as any).setData(trailData);
        } else {
          (src as any).setData(EMPTY_LINE_GEOJSON);
        }
      }
    };

    /* ── Visibility + opacity ─────────────────────────────────── */

    const applyTrackVisibility = () => {
      const { tracks, tracksVisible, tracksOpacity, showTrail } = useTrackStore.getState();

      for (const track of tracks) {
        const layId = trackLineLayerId(track.id);
        if (map.getLayer(layId)) {
          const vis = tracksVisible && track.visible && showTrail ? 'visible' : 'none';
          map.setLayoutProperty(layId, 'visibility', vis);
          map.setPaintProperty(layId, 'line-opacity', 0.9 * tracksOpacity);
        }
      }

      // Position arrow
      if (map.getLayer(POSITION_LAYER_ID)) {
        map.setLayoutProperty(
          POSITION_LAYER_ID,
          'visibility',
          tracksVisible ? 'visible' : 'none',
        );
      }

      updatePositionsAndTrails();
    };

    /* ── Sync tracks with map ─────────────────────────────────── */

    const syncTracks = () => {
      if (!map.isStyleLoaded()) return;

      ensurePositionLayer();

      const { tracks } = useTrackStore.getState();
      const currentIds = new Set(tracks.map((t) => t.id));

      // Remove tracks that no longer exist
      for (const id of addedTrackIdsRef.current) {
        if (!currentIds.has(id)) {
          removeTrackLine(id);
        }
      }

      // Add new tracks
      for (const track of tracks) {
        if (!addedTrackIdsRef.current.has(track.id)) {
          addTrackLine(track);
        }
      }

      applyTrackVisibility();
    };

    /* ── Subscriptions ────────────────────────────────────────── */

    const unsubTracks = useTrackStore.subscribe((state, prevState) => {
      if (state.tracks !== prevState.tracks) {
        syncTracks();
      }

      if (
        state.tracksVisible !== prevState.tracksVisible ||
        state.tracksOpacity !== prevState.tracksOpacity ||
        state.showTrail !== prevState.showTrail
      ) {
        applyTrackVisibility();
      }
    });

    // Timeline: rAF-batched position + trail updates
    let prevTimelineIndex = useTimelineStore.getState().currentIndex;
    let prevFrameTimesLen = useTimelineStore.getState().frameTimes.length;
    let positionRafId: number | null = null;
    const schedulePositionUpdate = () => {
      if (positionRafId === null) {
        positionRafId = requestAnimationFrame(() => {
          positionRafId = null;
          updatePositionsAndTrails();
        });
      }
    };
    const unsubTimeline = useTimelineStore.subscribe((state) => {
      if (state.currentIndex !== prevTimelineIndex || state.frameTimes.length !== prevFrameTimesLen) {
        prevTimelineIndex = state.currentIndex;
        prevFrameTimesLen = state.frameTimes.length;
        schedulePositionUpdate();
      }
    });

    // Auto-disable follow when user manually drags the map
    const onDragStart = () => {
      if (useTrackStore.getState().followTrack) {
        useTrackStore.getState().setFollowTrack(false);
      }
    };

    const onStyleLoad = () => {
      addedTrackIdsRef.current = new Set();
      positionLayerAddedRef.current = false;
      syncTracks();
    };

    syncTracks();
    map.on('style.load', onStyleLoad);
    map.on('dragstart', onDragStart);

    return () => {
      unsubTracks();
      unsubTimeline();
      if (positionRafId !== null) cancelAnimationFrame(positionRafId);
      map.off('style.load', onStyleLoad);
      map.off('dragstart', onDragStart);
    };
  }, [map]);

  return null;
}
