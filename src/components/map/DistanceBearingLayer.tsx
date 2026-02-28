/**
 * Distance & Bearing layer.
 *
 * When both a chase track (GPX) and storm path exist, this component:
 * 1. Interpolates both positions at the current radar time
 * 2. Draws a dashed line between them on the map
 * 3. Calculates distance (miles) and bearing
 * 4. Pushes the computed values to a shared ref for the overlay to read
 *
 * Uses the same time-sync pattern as ChaseTrackLayer and StormPathLayer.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from './MapContext';
import { useTrackStore } from '../../stores/trackStore';
import { useStormPathStore, type StormWaypoint } from '../../stores/stormPathStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { haversineDistance, calculateBearing, bearingToCardinal, kmToMiles } from '../../utils/geo';
import { isMapUsable } from '../../utils/mapSafety';
import type { TrackPoint } from '../../services/gps/gpxParser';

const LINE_SOURCE = 'distance-bearing-line';
const LINE_LAYER = 'distance-bearing-line-layer';

export interface DistanceBearingData {
  distanceMi: number;
  bearingDeg: number;
  cardinal: string;
  chaserLat: number;
  chaserLon: number;
  stormLat: number;
  stormLon: number;
}

/** Shared ref for DistanceBearingOverlay to read */
let _currentData: DistanceBearingData | null = null;
let _listeners: (() => void)[] = [];

export function getDistanceBearingData(): DistanceBearingData | null {
  return _currentData;
}

export function subscribeDistanceBearing(cb: () => void): () => void {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter((l) => l !== cb);
  };
}

function setDistanceBearingData(data: DistanceBearingData | null) {
  _currentData = data;
  for (const cb of _listeners) cb();
}

/** Interpolate chase track position at targetMs */
function interpolateTrackPosition(
  points: TrackPoint[],
  targetMs: number,
): { lat: number; lon: number } | null {
  if (points.length === 0) return null;
  if (targetMs < points[0].time) return { lat: points[0].lat, lon: points[0].lon };
  if (targetMs >= points[points.length - 1].time) {
    const last = points[points.length - 1];
    return { lat: last.lat, lon: last.lon };
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].time <= targetMs) lo = mid;
    else hi = mid;
  }

  const a = points[lo];
  const b = points[hi];
  const dt = b.time - a.time;
  if (dt <= 0) return { lat: a.lat, lon: a.lon };
  const t = (targetMs - a.time) / dt;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

/** Interpolate storm path position at targetMs */
function interpolateStormPosition(
  waypoints: StormWaypoint[],
  targetMs: number,
): { lat: number; lon: number } | null {
  if (waypoints.length === 0) return null;
  if (waypoints.length === 1) return { lat: waypoints[0].lat, lon: waypoints[0].lon };
  if (targetMs <= waypoints[0].timeMs) return { lat: waypoints[0].lat, lon: waypoints[0].lon };
  if (targetMs >= waypoints[waypoints.length - 1].timeMs) {
    const last = waypoints[waypoints.length - 1];
    return { lat: last.lat, lon: last.lon };
  }

  let lo = 0;
  let hi = waypoints.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (waypoints[mid].timeMs <= targetMs) lo = mid;
    else hi = mid;
  }

  const a = waypoints[lo];
  const b = waypoints[hi];
  const dt = b.timeMs - a.timeMs;
  if (dt <= 0) return { lat: a.lat, lon: a.lon };
  const t = (targetMs - a.timeMs) / dt;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

const EMPTY_LINE: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [] },
};

export function DistanceBearingLayer() {
  const map = useMap();
  const layerAddedRef = useRef(false);
  const rafRef = useRef(0);

  const updateLine = useCallback(() => {
    const currentMap = map;
    if (!isMapUsable(currentMap)) return;

    const { currentIndex, frameTimes } = useTimelineStore.getState();
    const targetMs = frameTimes[currentIndex] ?? 0;
    if (targetMs <= 0) {
      setDistanceBearingData(null);
      return;
    }

    // Get chase track (first visible track)
    const { tracks, tracksVisible } = useTrackStore.getState();
    const visibleTrack = tracksVisible ? tracks.find((t) => t.visible) : null;

    // Get storm path
    const { waypoints } = useStormPathStore.getState();

    if (!visibleTrack || waypoints.length < 2) {
      setDistanceBearingData(null);
      // Clear map line
      if (layerAddedRef.current) {
        const src = currentMap.getSource(LINE_SOURCE);
        if (src && 'setData' in src) (src as any).setData(EMPTY_LINE);
      }
      return;
    }

    const chaserPos = interpolateTrackPosition(visibleTrack.points, targetMs);
    const stormPos = interpolateStormPosition(waypoints, targetMs);

    if (!chaserPos || !stormPos) {
      setDistanceBearingData(null);
      return;
    }

    // Calculate distance and bearing
    const distKm = haversineDistance(chaserPos.lat, chaserPos.lon, stormPos.lat, stormPos.lon);
    const distMi = kmToMiles(distKm);
    const bearing = calculateBearing(chaserPos.lat, chaserPos.lon, stormPos.lat, stormPos.lon);
    const cardinal = bearingToCardinal(bearing);

    setDistanceBearingData({
      distanceMi: distMi,
      bearingDeg: bearing,
      cardinal,
      chaserLat: chaserPos.lat,
      chaserLon: chaserPos.lon,
      stormLat: stormPos.lat,
      stormLon: stormPos.lon,
    });

    // Update map line
    if (layerAddedRef.current) {
      const lineData: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [chaserPos.lon, chaserPos.lat],
            [stormPos.lon, stormPos.lat],
          ],
        },
      };
      const src = currentMap.getSource(LINE_SOURCE);
      if (src && 'setData' in src) (src as any).setData(lineData);
    }
  }, [map]);

  useEffect(() => {
    if (!map) return;
    layerAddedRef.current = false;

    const ensureLayer = () => {
      if (layerAddedRef.current) return;
      if (!isMapUsable(map)) return;
      if (!map.isStyleLoaded()) return;

      if (!map.getSource(LINE_SOURCE)) {
        map.addSource(LINE_SOURCE, {
          type: 'geojson',
          data: EMPTY_LINE,
        });
      }

      if (!map.getLayer(LINE_LAYER)) {
        map.addLayer({
          id: LINE_LAYER,
          type: 'line',
          source: LINE_SOURCE,
          layout: {
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 2,
            'line-opacity': 0.7,
            'line-dasharray': [4, 4],
          },
        });
      }

      layerAddedRef.current = true;
    };

    ensureLayer();

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateLine);
    };

    // Subscribe to timeline changes
    let prevIndex = useTimelineStore.getState().currentIndex;
    const unsubTimeline = useTimelineStore.subscribe((state) => {
      if (state.currentIndex !== prevIndex) {
        prevIndex = state.currentIndex;
        scheduleUpdate();
      }
    });

    // Subscribe to storm path changes
    const unsubStorm = useStormPathStore.subscribe(() => {
      scheduleUpdate();
    });

    // Subscribe to track changes
    const unsubTrack = useTrackStore.subscribe(() => {
      scheduleUpdate();
    });

    const onStyleLoad = () => {
      layerAddedRef.current = false;
      ensureLayer();
      scheduleUpdate();
    };

    map.on('style.load', onStyleLoad);

    // Initial update
    updateLine();

    return () => {
      unsubTimeline();
      unsubStorm();
      unsubTrack();
      cancelAnimationFrame(rafRef.current);
      setDistanceBearingData(null);
      layerAddedRef.current = false;
      try {
        map.off('style.load', onStyleLoad);
        if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
        if (map.getSource(LINE_SOURCE)) map.removeSource(LINE_SOURCE);
      } catch { /* map already destroyed */ }
    };
  }, [map, updateLine]);

  return null;
}
