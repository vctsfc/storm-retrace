/**
 * Surface observations layer.
 *
 * Renders ASOS/METAR station plots on the map:
 * - Wind barb icon (rotated by wind direction)
 * - Temperature (°F) in red, upper-left
 * - Dewpoint (°F) in green, lower-left
 *
 * Time-synced: for each station, shows the most recent observation
 * where utcValid ≤ currentRadarTime.
 *
 * Memory optimizations:
 * - Pre-indexes obs by station on data load (avoids iterating all obs per frame)
 * - Throttles GeoJSON rebuilds to max every 500ms during playback
 * - Reuses GeoJSON object structure where possible
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useOverlayStore, type SurfaceObservation } from '../../stores/overlayStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { registerWindBarbIcons, getWindBarbIconId } from '../../utils/windBarb';
import { isMapUsable } from '../../utils/mapSafety';

const SOURCE_ID = 'surface-obs';
const BARB_LAYER_ID = 'surface-obs-barbs';
const TEMP_LAYER_ID = 'surface-obs-temp';
const DEWP_LAYER_ID = 'surface-obs-dewp';

/** Minimum interval between GeoJSON rebuilds during playback (ms) */
const THROTTLE_MS = 500;

/**
 * Pre-indexed observations: Map<stationId, obs[] sorted by utcValid ascending>.
 * Built once when obs data changes, used on every frame.
 */
type ObsIndex = Map<string, SurfaceObservation[]>;

function buildObsIndex(obs: SurfaceObservation[]): ObsIndex {
  const index: ObsIndex = new Map();
  for (const o of obs) {
    let arr = index.get(o.station);
    if (!arr) {
      arr = [];
      index.set(o.station, arr);
    }
    arr.push(o);
  }
  // Sort each station's obs by time ascending
  for (const arr of index.values()) {
    arr.sort((a, b) => a.utcValid - b.utcValid);
  }
  return index;
}

/**
 * For a sorted array of obs for one station, find the latest where utcValid ≤ target.
 * Binary search, O(log n).
 */
function findLatestObs(
  sorted: SurfaceObservation[],
  targetMs: number,
): SurfaceObservation | null {
  if (sorted.length === 0) return null;
  if (targetMs < sorted[0].utcValid) return null;
  if (targetMs >= sorted[sorted.length - 1].utcValid) return sorted[sorted.length - 1];

  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (sorted[mid].utcValid <= targetMs) lo = mid;
    else hi = mid - 1;
  }
  return sorted[lo];
}

/**
 * Select the latest observation per station using the pre-built index.
 */
function selectFromIndex(
  index: ObsIndex,
  targetTimeMs: number,
  timeSynced: boolean,
): SurfaceObservation[] {
  const result: SurfaceObservation[] = [];
  for (const [, sorted] of index) {
    if (!timeSynced) {
      // Not time-synced: use the latest obs
      result.push(sorted[sorted.length - 1]);
    } else {
      const obs = findLatestObs(sorted, targetTimeMs);
      if (obs) result.push(obs);
    }
  }
  return result;
}

/**
 * Convert selected surface observations to a GeoJSON FeatureCollection.
 */
function obsToGeoJSON(obs: SurfaceObservation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: obs.map((o) => ({
      type: 'Feature' as const,
      properties: {
        station: o.station,
        tmpf: o.tmpf,
        dwpf: o.dwpf,
        drct: o.drct,
        sknt: o.sknt,
        gust: o.gust,
        mslp: o.mslp,
        skyc1: o.skyc1,
        barbIcon: o.sknt != null && o.drct != null ? getWindBarbIconId(o.sknt) : 'wind-barb-0',
        barbRotation: o.drct ?? 0,
        tmpfStr: o.tmpf != null ? Math.round(o.tmpf).toString() : '',
        dwpfStr: o.dwpf != null ? Math.round(o.dwpf).toString() : '',
      },
      geometry: {
        type: 'Point',
        coordinates: [o.lon, o.lat],
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

export function SurfaceObsLayer() {
  const map = useMap();
  const addedRef = useRef(false);
  const iconsRegisteredRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const obsIndexRef = useRef<ObsIndex>(new Map());
  const lastUpdateRef = useRef(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!map) return;
    addedRef.current = false;
    iconsRegisteredRef.current = false;
    obsIndexRef.current = new Map();

    const ensureIcons = async (): Promise<boolean> => {
      if (iconsRegisteredRef.current) return true;
      try {
        await registerWindBarbIcons(map);
        iconsRegisteredRef.current = true;
        return true;
      } catch (err) {
        console.error('[SurfaceObsLayer] Failed to register wind barb icons:', err);
        return false;
      }
    };

    const addLayers = async () => {
      if (addedRef.current) return;
      if (!map.isStyleLoaded()) {
        map.once('style.load', () => addLayers());
        return;
      }
      if (map.getSource(SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      const iconsOk = await ensureIcons();
      if (!iconsOk) return;

      if (addedRef.current || map.getSource(SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      const geojson = buildCurrentGeoJSON();

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      const beforeId = findBeforeId(map, [
        'chase-track-line',
        'chase-track-pos',
        'nexrad-sites-layer',
      ]);

      map.addLayer(
        {
          id: BARB_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'icon-image': ['get', 'barbIcon'],
            'icon-rotate': ['get', 'barbRotation'],
            'icon-size': 0.9,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-rotation-alignment': 'map',
          },
          paint: {
            'icon-opacity': 1,
          },
        },
        beforeId,
      );

      map.addLayer(
        {
          id: TEMP_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['get', 'tmpfStr'],
            'text-font': ['Open Sans Bold'],
            'text-size': 12,
            'text-offset': [-1.8, -1.2],
            'text-anchor': 'center',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ff4444',
            'text-halo-color': '#000000',
            'text-halo-width': 1.5,
          },
        },
        beforeId,
      );

      map.addLayer(
        {
          id: DEWP_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['get', 'dwpfStr'],
            'text-font': ['Open Sans Bold'],
            'text-size': 12,
            'text-offset': [-1.8, 1.2],
            'text-anchor': 'center',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#44cc44',
            'text-halo-color': '#000000',
            'text-halo-width': 1.5,
          },
        },
        beforeId,
      );

      addedRef.current = true;
      applyVisibility();
      applyOpacity();
    };

    const buildCurrentGeoJSON = (): GeoJSON.FeatureCollection => {
      const { surfaceObsTimeSynced } = useOverlayStore.getState();
      const { currentIndex, frameTimes } = useTimelineStore.getState();
      const currentTimeMs = frameTimes[currentIndex] ?? 0;
      const selected = selectFromIndex(obsIndexRef.current, currentTimeMs, surfaceObsTimeSynced);
      return obsToGeoJSON(selected);
    };

    const doUpdate = () => {
      if (!addedRef.current || !isMapUsable(map)) return;
      const source = map.getSource(SOURCE_ID);
      if (source && 'setData' in source) {
        (source as any).setData(buildCurrentGeoJSON());
      }
      lastUpdateRef.current = Date.now();
    };

    /** Throttled update: max one setData call per THROTTLE_MS */
    const updateSourceData = () => {
      if (!addedRef.current) return;

      const now = Date.now();
      const elapsed = now - lastUpdateRef.current;

      if (elapsed >= THROTTLE_MS) {
        // Enough time has passed — update immediately
        if (pendingUpdateRef.current) {
          clearTimeout(pendingUpdateRef.current);
          pendingUpdateRef.current = null;
        }
        doUpdate();
      } else if (!pendingUpdateRef.current) {
        // Schedule a deferred update
        pendingUpdateRef.current = setTimeout(() => {
          pendingUpdateRef.current = null;
          doUpdate();
        }, THROTTLE_MS - elapsed);
      }
      // else: update already scheduled, skip
    };

    const applyVisibility = () => {
      if (!addedRef.current || !isMapUsable(map)) return;
      const { surfaceObsVisible } = useOverlayStore.getState();
      const visibility = surfaceObsVisible ? 'visible' : 'none';
      for (const layerId of [BARB_LAYER_ID, TEMP_LAYER_ID, DEWP_LAYER_ID]) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      }
    };

    const applyOpacity = () => {
      if (!addedRef.current || !isMapUsable(map)) return;
      const { surfaceObsOpacity } = useOverlayStore.getState();
      if (map.getLayer(BARB_LAYER_ID)) {
        map.setPaintProperty(BARB_LAYER_ID, 'icon-opacity', surfaceObsOpacity);
      }
      if (map.getLayer(TEMP_LAYER_ID)) {
        map.setPaintProperty(TEMP_LAYER_ID, 'text-opacity', surfaceObsOpacity);
      }
      if (map.getLayer(DEWP_LAYER_ID)) {
        map.setPaintProperty(DEWP_LAYER_ID, 'text-opacity', surfaceObsOpacity);
      }
    };

    const onFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const f = e.features[0];
      const p = f.properties;
      if (!p) return;

      popupRef.current?.remove();

      const lines: string[] = [];
      lines.push(`<strong>${p.station}</strong>`);

      if (p.tmpf !== '' && p.tmpf != null) {
        lines.push(`<div>Temp: <span style="color:#ff4444">${p.tmpf}°F</span></div>`);
      }
      if (p.dwpf !== '' && p.dwpf != null) {
        lines.push(`<div>Dewpt: <span style="color:#44cc44">${p.dwpf}°F</span></div>`);
      }
      if (p.sknt != null && p.sknt !== '') {
        const windStr = p.drct != null && p.drct !== '' ? `${p.drct}° @ ${p.sknt} kt` : `${p.sknt} kt`;
        const gustStr = p.gust != null && p.gust !== '' && p.gust > 0 ? ` G${p.gust}` : '';
        lines.push(`<div>Wind: ${windStr}${gustStr}</div>`);
      }
      if (p.mslp != null && p.mslp !== '') {
        lines.push(`<div>MSLP: ${p.mslp} mb</div>`);
      }
      if (p.skyc1 != null && p.skyc1 !== '') {
        lines.push(`<div>Sky: ${p.skyc1}</div>`);
      }

      const coords = (f.geometry as GeoJSON.Point).coordinates;
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '240px',
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(`<div style="color:#eee;font-size:12px;line-height:1.6">${lines.join('')}</div>`)
        .addTo(map);
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const unsubOverlay = useOverlayStore.subscribe((state, prevState) => {
      if (state.surfaceObs !== prevState.surfaceObs) {
        // Rebuild the pre-indexed lookup
        obsIndexRef.current = buildObsIndex(state.surfaceObs);
        console.log(`[SurfaceObsLayer] Indexed ${obsIndexRef.current.size} stations`);

        if (state.surfaceObs.length > 0 && !addedRef.current) {
          addLayers();
        } else {
          doUpdate(); // Immediate update on new data
        }
      }

      if (
        state.surfaceObsVisible !== prevState.surfaceObsVisible ||
        state.surfaceObsTimeSynced !== prevState.surfaceObsTimeSynced
      ) {
        applyVisibility();
        doUpdate();
      }

      if (state.surfaceObsOpacity !== prevState.surfaceObsOpacity) {
        applyOpacity();
      }
    });

    let prevTimelineIndex = useTimelineStore.getState().currentIndex;
    const unsubTimeline = useTimelineStore.subscribe((state) => {
      if (state.currentIndex !== prevTimelineIndex) {
        prevTimelineIndex = state.currentIndex;
        const { surfaceObsVisible, surfaceObsTimeSynced } = useOverlayStore.getState();
        if (surfaceObsVisible && surfaceObsTimeSynced) {
          updateSourceData(); // Throttled
        }
      }
    });

    const onStyleLoad = () => {
      addedRef.current = false;
      iconsRegisteredRef.current = false;
      addLayers();
    };

    addLayers();
    map.on('style.load', onStyleLoad);

    const bindEvents = () => {
      if (!isMapUsable(map)) return;
      if (map.getLayer(BARB_LAYER_ID)) {
        map.on('click', BARB_LAYER_ID, onFeatureClick);
        map.on('mouseenter', BARB_LAYER_ID, onMouseEnter);
        map.on('mouseleave', BARB_LAYER_ID, onMouseLeave);
      }
    };
    bindEvents();
    map.on('sourcedata', bindEvents);

    return () => {
      unsubOverlay();
      unsubTimeline();
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
      try {
        map.off('style.load', onStyleLoad);
        map.off('sourcedata', bindEvents);
        if (map.getLayer(BARB_LAYER_ID)) {
          map.off('click', BARB_LAYER_ID, onFeatureClick);
          map.off('mouseenter', BARB_LAYER_ID, onMouseEnter);
          map.off('mouseleave', BARB_LAYER_ID, onMouseLeave);
        }
      } catch { /* map destroyed */ }
      popupRef.current?.remove();
    };
  }, [map]);

  return null;
}
