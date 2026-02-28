import { useEffect, useRef, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useTimelineStore } from '../../stores/timelineStore';
import { useRadarStore, getActiveColorTable } from '../../stores/radarStore';
import { frameCache, FrameCache } from '../../services/nexrad/frameCache';
import { getPrefetchManager } from '../../services/nexrad/prefetchManager';
import { computeRadarBounds } from '../../services/nexrad/renderer';
import { playChime } from '../../utils/chime';
import type { RenderedFrame } from '../../services/nexrad/types';

const RADAR_SOURCE_ID = 'radar-image';
const RADAR_LAYER_ID = 'radar-layer';

/**
 * Manages the radar overlay on the MapLibre map.
 *
 * Optimized pipeline:
 * - PrefetchManager handles download + worker decode/render in background
 * - Workers create PNG blobs → main thread creates instant blob URLs
 * - This component only reads from FrameCache and passes pre-computed
 *   blob URLs to MapLibre — frame display is <1ms, fully synchronous
 * - Custom color palettes are passed through to the worker pipeline
 */
export function RadarLayer() {
  const map = useMap();
  const lastRenderedRef = useRef<string>('');
  const mapRef = useRef<maplibregl.Map | null>(null);
  const displayRafRef = useRef(0);

  mapRef.current = map;

  /**
   * Try to display the current frame from the cache.
   * If not cached, the prefetch manager is already working on it.
   */
  const displayCurrentFrame = useCallback(() => {
    const currentMap = mapRef.current;
    if (!currentMap) return;

    const { currentIndex, frameTimes } = useTimelineStore.getState();
    const radarState = useRadarStore.getState();
    const { selectedSite, product, elevationIndex, scanFiles, paletteVersion, radarSmoothing } = radarState;

    if (!selectedSite || frameTimes.length === 0 || scanFiles.length === 0) return;
    if (currentIndex < 0 || currentIndex >= scanFiles.length) return;

    const scanFile = scanFiles[currentIndex];
    const cacheKey = FrameCache.makeKey(
      scanFile.key,
      scanFile.timestamp,
      product,
      elevationIndex,
      paletteVersion,
      radarSmoothing,
      scanFile.sweepIndex,
    );

    // Skip if already showing this exact frame
    if (lastRenderedRef.current === cacheKey) return;

    // Check frame cache
    const frame = frameCache.get(cacheKey);
    if (frame) {
      updateMapImage(currentMap, frame);
      lastRenderedRef.current = cacheKey;
    }
    // If not cached, prefetchManager is working on it and will notify us via onFrameReady
  }, []);

  /**
   * Schedule a display update on the next animation frame.
   *
   * MapLibre's ImageSource.updateImage() loads blob URLs asynchronously.
   * During rapid scrubbing, multiple updateImage calls can race — if an
   * earlier image finishes loading AFTER a later one, the display briefly
   * shows a stale frame (the "reverse frame" artifact).
   *
   * By coalescing rapid index changes into a single RAF, we ensure only
   * one updateImage call per animation frame, eliminating the race.
   */
  const scheduleDisplay = useCallback(() => {
    cancelAnimationFrame(displayRafRef.current);
    displayRafRef.current = requestAnimationFrame(() => {
      displayCurrentFrame();
    });
  }, [displayCurrentFrame]);

  /**
   * Trigger the prefetch manager to update its window and schedule display.
   */
  const onFrameChange = useCallback(() => {
    const radarState = useRadarStore.getState();
    const { selectedSite, product, elevationIndex, scanFiles, paletteVersion, radarSmoothing } = radarState;
    const { currentIndex } = useTimelineStore.getState();

    if (!selectedSite || scanFiles.length === 0) return;

    // Resolve active color table for the current product
    const colorTable = getActiveColorTable(radarState, product);

    // Update prefetch window immediately
    const pm = getPrefetchManager();
    pm.updateWindow(
      currentIndex,
      scanFiles,
      product as 'REF' | 'VEL',
      elevationIndex,
      selectedSite.lat,
      selectedSite.lon,
      colorTable,
      paletteVersion,
      radarSmoothing,
    );

    // Coalesce display update to next animation frame to prevent
    // out-of-order MapLibre image loads during rapid scrubbing
    scheduleDisplay();
  }, [scheduleDisplay]);

  // Subscribe to store changes
  useEffect(() => {
    if (!map) return;

    // Register callback for when prefetch completes a frame
    const pm = getPrefetchManager();
    pm.setOnFrameReady((_cacheKey: string) => {
      // A frame just became available — schedule display check for next frame.
      // Coalescing via RAF prevents out-of-order image loads when multiple
      // frames complete in quick succession.
      scheduleDisplay();
    });

    /**
     * Start background prefetch of ALL frames for the current event.
     * Uses spiral ordering from current position outward.
     * Reports progress to radarStore for the UI progress indicator.
     */
    const startBackgroundPrefetch = () => {
      const radarState = useRadarStore.getState();
      const { selectedSite, product, elevationIndex, scanFiles, paletteVersion, radarSmoothing } = radarState;
      const { currentIndex } = useTimelineStore.getState();

      if (!selectedSite || scanFiles.length === 0) return;

      const colorTable = getActiveColorTable(radarState, product);

      // Report progress to store for UI indicator
      useRadarStore.getState().setPrefetchProgress({ completed: 0, total: scanFiles.length });

      pm.downloadAll(
        scanFiles,
        product as 'REF' | 'VEL',
        elevationIndex,
        selectedSite.lat,
        selectedSite.lon,
        (completed, total) => {
          useRadarStore.getState().setPrefetchProgress({ completed, total });
          // Clear progress when done and notify user
          if (completed >= total) {
            useRadarStore.getState().setPrefetchProgress(null);
            playChime();
          }
        },
        colorTable,
        paletteVersion,
        currentIndex, // Start from current position, spiral outward
        radarSmoothing,
      );
    };

    let prevTimelineIndex = useTimelineStore.getState().currentIndex;
    let prevProduct = useRadarStore.getState().product;
    let prevElevation = useRadarStore.getState().elevationIndex;
    let prevScanCount = useRadarStore.getState().scanFiles.length;
    let prevRadarOpacity = useRadarStore.getState().radarOpacity;
    let prevPaletteVersion = useRadarStore.getState().paletteVersion;
    let prevSmoothing = useRadarStore.getState().radarSmoothing;

    const unsubTimeline = useTimelineStore.subscribe((state) => {
      if (state.currentIndex !== prevTimelineIndex) {
        prevTimelineIndex = state.currentIndex;
        // Display is now instant (pre-computed blob URL) — no throttle needed
        onFrameChange();
      }
    });

    const unsubRadar = useRadarStore.subscribe((state) => {
      const scanCount = state.scanFiles.length;

      if (state.product !== prevProduct || state.elevationIndex !== prevElevation) {
        prevProduct = state.product;
        prevElevation = state.elevationIndex;
        lastRenderedRef.current = '';
        // Cancel prefetch and restart with new product/elevation
        pm.cancelAll();
        onFrameChange();
        // Re-prefetch ALL frames with new product/elevation
        startBackgroundPrefetch();
      }

      // Handle palette changes — clear frame cache (all frames are wrong colors)
      // Worker's parsed-radar cache stays valid → re-render is fast (~100-200ms/frame)
      if (state.paletteVersion !== prevPaletteVersion) {
        prevPaletteVersion = state.paletteVersion;
        lastRenderedRef.current = '';
        frameCache.clear();
        pm.cancelAll();
        onFrameChange();
        // Re-prefetch ALL frames with new palette
        startBackgroundPrefetch();
      }

      // Handle smoothing toggle — clear frame cache (all frames need re-render)
      // Worker's parsed-radar cache stays valid → re-render is fast
      if (state.radarSmoothing !== prevSmoothing) {
        prevSmoothing = state.radarSmoothing;
        lastRenderedRef.current = '';
        frameCache.clear();
        pm.cancelAll();
        onFrameChange();
        startBackgroundPrefetch();
      }

      // Apply radar opacity changes
      if (state.radarOpacity !== prevRadarOpacity) {
        prevRadarOpacity = state.radarOpacity;
        if (map.getLayer(RADAR_LAYER_ID)) {
          map.setPaintProperty(RADAR_LAYER_ID, 'raster-opacity', state.radarOpacity);
        }
      }

      // Auto-prefetch ALL frames when scans are first loaded
      if (scanCount > 0 && prevScanCount === 0) {
        prevScanCount = scanCount;
        onFrameChange();
        startBackgroundPrefetch();
      }
      prevScanCount = scanCount;
    });

    // Re-add radar layer when basemap style changes (setStyle removes all custom layers)
    const onStyleLoad = () => {
      lastRenderedRef.current = '';
      displayCurrentFrame();
    };
    map.on('style.load', onStyleLoad);

    return () => {
      unsubTimeline();
      unsubRadar();
      pm.setOnFrameReady(null as any);
      map.off('style.load', onStyleLoad);
      cancelAnimationFrame(displayRafRef.current);
    };
  }, [map, displayCurrentFrame, onFrameChange, scheduleDisplay]);

  return null;
}

/**
 * Find the first existing layer from a list of candidates for z-ordering.
 */
function findBeforeId(map: maplibregl.Map, candidates: string[]): string | undefined {
  for (const id of candidates) {
    if (map.getLayer(id)) return id;
  }
  return undefined;
}

/**
 * Update or create the radar image layer on the map.
 *
 * Blob URLs are pre-computed in the worker pipeline (PNG encoding runs in
 * Web Workers, blob URL created on cache insert). Display is now instant:
 * just pass the pre-computed URL to MapLibre. No canvas, no toBlob, no async waits.
 */
function updateMapImage(map: maplibregl.Map, frame: RenderedFrame) {
  const bounds = computeRadarBounds(frame.siteLat, frame.siteLon, frame.rangeKm);

  const source = map.getSource(RADAR_SOURCE_ID) as maplibregl.ImageSource | undefined;

  if (source) {
    source.updateImage({
      url: frame.blobUrl,
      coordinates: bounds,
    });
  } else {
    map.addSource(RADAR_SOURCE_ID, {
      type: 'image',
      url: frame.blobUrl,
      coordinates: bounds,
    });

    const beforeId = findBeforeId(map, [
      'spc-watches-fill',
      'nws-warnings-fill',
      'spc-mcds-fill',
      'lsr-reports-circles',
      'nexrad-sites-layer',
    ]);

    map.addLayer({
      id: RADAR_LAYER_ID,
      type: 'raster',
      source: RADAR_SOURCE_ID,
      paint: {
        'raster-opacity': useRadarStore.getState().radarOpacity,
        'raster-fade-duration': 0,
        'raster-resampling': 'nearest',
      },
    }, beforeId);
  }
}
