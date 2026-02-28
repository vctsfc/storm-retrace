import { useState, useCallback, useEffect, useRef } from 'react';
import { useRadarStore, type NexradSite, type RadarSegment } from '../../stores/radarStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useOverlayStore } from '../../stores/overlayStore';
import { useStormPathStore } from '../../stores/stormPathStore';
import { listScansForRange, fetchScan } from '../../services/nexrad/s3Client';
import { rawScanCache, frameCache } from '../../services/nexrad/frameCache';
import { getWorkerPool, resetWorkerPool } from '../../services/nexrad/workerPool';
import { getPrefetchManager } from '../../services/nexrad/prefetchManager';
import { parseLocalDateTime, getTimezoneAbbr } from '../../utils/time';
import { getPublicAssetUrl } from '../../utils/baseUrl';
import type { ScanFile } from '../../services/nexrad/types';

interface StationFeature {
  properties: { id: string; name: string; elevation: number; tz?: string };
  geometry: { coordinates: [number, number] };
}

const EVENT_STORAGE_KEY = 'storm-replay-event';

function getStoredEvent(): { date?: string; startTime?: string; endTime?: string } {
  try {
    const raw = localStorage.getItem(EVENT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt data */ }
  return {};
}

function saveEvent(date: string, startTime: string, endTime: string): void {
  try {
    localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify({ date, startTime, endTime }));
  } catch { /* ignore storage errors */ }
}

/**
 * Expand scan files by duplicating each volume entry into multiple
 * sweep entries when SAILS is detected.
 *
 * Each original scan becomes `sweepCount` entries sharing the same S3 key
 * but with different sweepIndex values. Timestamps are interpolated
 * between consecutive volumes so the timeline spacing is realistic.
 */
function expandScansForSails(scans: ScanFile[], sweepCount: number): ScanFile[] {
  if (sweepCount <= 1) return scans;

  const expanded: ScanFile[] = [];

  for (let i = 0; i < scans.length; i++) {
    const scan = scans[i];
    // Estimate time between this volume and the next
    const nextTs = i < scans.length - 1 ? scans[i + 1].timestamp : scan.timestamp;
    const volumeInterval = nextTs - scan.timestamp;

    for (let sw = 0; sw < sweepCount; sw++) {
      // Interpolate timestamp: spread sweeps evenly across the volume interval
      const sweepTs = scan.timestamp + Math.round(sw * volumeInterval / sweepCount);

      expanded.push({
        key: scan.key,
        timestamp: sweepTs,
        size: scan.size,
        sweepIndex: sw,
        sweepCount,
      });
    }
  }

  return expanded;
}

/**
 * Probe a single scan file for SAILS sweep count.
 * Downloads the file, parses it in a worker, and returns { sweepCount, vcp }.
 */
async function probeSingleFile(
  scan: ScanFile,
  siteLat: number,
  siteLon: number,
): Promise<{ sweepCount: number; vcp: number }> {
  const buffer = await fetchScan(scan.key);
  // Cache the raw scan so prefetch doesn't re-download it
  rawScanCache.set(scan.key, buffer);

  const pool = getWorkerPool();
  const result = await pool.probeSweeps({
    scanBuffer: buffer.slice(0),
    scanKey: scan.key,
    elevationNumber: 1,
    siteLat,
    siteLon,
  });

  return {
    sweepCount: result.sweepCount ?? 1,
    vcp: result.vcp ?? 0,
  };
}

/**
 * Probe scan files for SAILS sweep count. Tries up to 3 files
 * (first, ~25% through, ~50% through) and takes the maximum sweep count
 * found. This handles cases where the first file is truncated or from a
 * VCP transition where SAILS wasn't yet active.
 */
async function probeSailsSweepCount(
  scans: ScanFile[],
  siteLat: number,
  siteLon: number,
): Promise<{ sweepCount: number; vcp: number }> {
  if (scans.length === 0) return { sweepCount: 1, vcp: 0 };

  // Pick probe indices: first, ~25%, ~50% through the list
  const probeIndices = [0];
  if (scans.length > 4) {
    probeIndices.push(Math.floor(scans.length * 0.25));
  }
  if (scans.length > 10) {
    probeIndices.push(Math.floor(scans.length * 0.5));
  }

  // Cancel any stale worker tasks so probe runs immediately
  getWorkerPool().cancelAll();

  let bestSweepCount = 1;
  let detectedVcp = 0;

  for (const idx of probeIndices) {
    try {
      const { sweepCount, vcp } = await probeSingleFile(scans[idx], siteLat, siteLon);
      console.log(`[SAILS] Probe #${idx} (${scans[idx].key}): VCP=${vcp}, sweepCount=${sweepCount}`);
      if (vcp) detectedVcp = vcp;
      if (sweepCount > bestSweepCount) {
        bestSweepCount = sweepCount;
      }
      // If we already found SAILS, no need to probe more files
      if (bestSweepCount > 1) break;
    } catch (err) {
      console.warn(`[SAILS] Probe #${idx} failed:`, err);
      // Continue to next file
    }
  }

  console.log(`[SAILS] Final result: VCP=${detectedVcp}, sweepCount=${bestSweepCount}`);
  return { sweepCount: bestSweepCount, vcp: detectedVcp };
}

/**
 * Load scan data for multiple radar segments (multi-site handoff).
 *
 * For each segment, fetches S3 file list, probes SAILS, expands sweeps,
 * tags each ScanFile with its site info, then merges all into a single
 * sorted timeline. Called by SegmentEditor when segments change.
 */
export async function loadSegments(segments: RadarSegment[]): Promise<void> {
  if (segments.length === 0) return;

  const store = useRadarStore.getState();
  const timeline = useTimelineStore.getState();

  store.setLoading(true);
  store.setError(null);
  store.setCurrentFrameStats(null);

  getPrefetchManager().cancelAll();
  rawScanCache.clear();
  frameCache.clear();

  try {
    // Fetch scans for each segment in parallel
    const segmentScans = await Promise.all(
      segments.map(async (seg) => {
        const scans = await listScansForRange(
          seg.site.id,
          new Date(seg.startMs),
          new Date(seg.endMs),
        );
        // Tag each scan with its site info
        return scans.map((scan) => ({
          ...scan,
          siteId: seg.site.id,
          siteLat: seg.site.lat,
          siteLon: seg.site.lon,
        }));
      }),
    );

    // SAILS probe + expansion per segment (sites may differ in sweep count)
    const expandedSegments = await Promise.all(
      segmentScans.map(async (scans, i) => {
        if (scans.length === 0) return scans;
        const seg = segments[i];
        const { sweepCount } = await probeSailsSweepCount(scans, seg.site.lat, seg.site.lon);
        const expanded = expandScansForSails(scans, sweepCount);
        // Preserve site tags through expansion
        return expanded.map((s) => ({
          ...s,
          siteId: seg.site.id,
          siteLat: seg.site.lat,
          siteLon: seg.site.lon,
        }));
      }),
    );

    const allScans = expandedSegments.flat();
    allScans.sort((a, b) => a.timestamp - b.timestamp);

    if (allScans.length === 0) {
      store.setError('No scans found for any segment');
      store.setScanFiles([]);
      timeline.setFrameTimes([]);
    } else {
      timeline.setFrameTimes(allScans.map((s) => s.timestamp));
      store.setScanFiles(allScans);
      store.setSegments(segments);
      store.setAvailableElevations([]);
      store.setElevationIndex(0);
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load multi-site scans');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Event picker form: date, time range, and site selection.
 * Remembers last used date/time between sessions via localStorage.
 *
 * After loading scan files, probes the first volume for SAILS supplemental
 * sweeps. If detected, expands the timeline with per-sweep entries for
 * higher temporal resolution (~1-2 min vs ~4-5 min).
 */
export function EventPicker() {
  const stored = getStoredEvent();
  const [date, setDate] = useState(stored.date ?? '2013-05-20');
  const [startTime, setStartTime] = useState(stored.startTime ?? '15:00');
  const [endTime, setEndTime] = useState(stored.endTime ?? '22:00');
  const [siteQuery, setSiteQuery] = useState('');
  const [stations, setStations] = useState<StationFeature[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Load stations list once
  useEffect(() => {
    fetch(getPublicAssetUrl('nexrad-stations.geojson'))
      .then((r) => r.json())
      .then((geojson) => setStations(geojson.features))
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Listen for GPX auto-set events (GPX import sets localStorage + dispatches event)
  useEffect(() => {
    const handler = () => {
      const stored = getStoredEvent();
      if (stored.date) setDate(stored.date);
      if (stored.startTime) setStartTime(stored.startTime);
      if (stored.endTime) setEndTime(stored.endTime);
    };
    window.addEventListener('gpx-event-auto-set', handler);
    return () => window.removeEventListener('gpx-event-auto-set', handler);
  }, []);

  const filteredStations = siteQuery.length > 0
    ? stations.filter((s) => {
        const q = siteQuery.toUpperCase();
        return s.properties.id.includes(q) || s.properties.name.toUpperCase().includes(q);
      }).slice(0, 10)
    : [];

  const selectStation = useCallback((station: StationFeature) => {
    const site: NexradSite = {
      id: station.properties.id,
      name: station.properties.name,
      lat: station.geometry.coordinates[1],
      lon: station.geometry.coordinates[0],
      elevation: station.properties.elevation,
      tz: station.properties.tz || 'UTC',
    };
    useRadarStore.getState().setSelectedSite(site);
    setSiteQuery('');
    setShowResults(false);
    // Fly map to the selected site
    const map = (window as any).__stormReplayMap;
    if (map) {
      map.flyTo({ center: [site.lon, site.lat], zoom: 8, duration: 1000 });
    }
  }, []);

  const selectedSite = useRadarStore((s) => s.selectedSite);
  const loading = useRadarStore((s) => s.loading);
  const error = useRadarStore((s) => s.error);
  const scanFiles = useRadarStore((s) => s.scanFiles);

  const handleClearAll = useCallback(() => {
    // Stop playback
    useTimelineStore.getState().setPlaying(false);

    // Cancel all in-flight prefetch/downloads
    getPrefetchManager().cancelAll();

    // Clear all caches (revokes blob URLs, frees ArrayBuffers)
    frameCache.clear();
    rawScanCache.clear();

    // Terminate worker pool to free worker-side parsed radar caches (~240-360 MB)
    // and persistent OffscreenCanvas GPU memory. Workers recreate lazily on next load.
    resetWorkerPool();

    // Reset radar state (scan files, progress, errors)
    const radar = useRadarStore.getState();
    radar.setScanFiles([]);
    radar.setAvailableElevations([]);
    radar.setElevationIndex(0);
    radar.setError(null);
    radar.setPrefetchProgress(null);

    // Reset timeline
    const timeline = useTimelineStore.getState();
    timeline.setFrameTimes([]);
    timeline.clearLoop();

    // Clear all overlays (warnings, watches, MCDs, outlooks, LSRs, surface obs)
    useOverlayStore.getState().clearAllOverlays();

    // Clear storm path
    useStormPathStore.getState().clearPath();

    // Remove radar layer from map
    const map = (window as any).__stormReplayMap;
    if (map) {
      try {
        if (map.getLayer('radar-layer')) map.removeLayer('radar-layer');
        if (map.getSource('radar-image')) map.removeSource('radar-image');
      } catch { /* layer may already be gone */ }
    }
  }, []);

  const handleLoad = useCallback(async () => {
    if (!selectedSite || !date) return;

    // Persist event settings for next session
    saveEvent(date, startTime, endTime);

    const store = useRadarStore.getState();
    const timeline = useTimelineStore.getState();

    store.setLoading(true);
    store.setError(null);
    store.setCurrentFrameStats(null); // Clear stale stats from previous event

    // Cancel any in-flight prefetch jobs and clear caches for new event.
    // This frees worker slots so the SAILS probe doesn't wait behind old jobs.
    getPrefetchManager().cancelAll();
    rawScanCache.clear();
    frameCache.clear();

    try {
      const tz = selectedSite.tz || 'UTC';
      const startMs = parseLocalDateTime(date, startTime, tz);
      const endMs = parseLocalDateTime(date, endTime, tz);

      // If end is before start, assume it wraps to next day
      const adjustedEnd = endMs <= startMs
        ? endMs + 86400000
        : endMs;

      const scans = await listScansForRange(
        selectedSite.id,
        new Date(startMs),
        new Date(adjustedEnd),
      );

      if (scans.length === 0) {
        store.setError(`No scans found for ${selectedSite.id} on ${date}`);
        store.setScanFiles([]);
        timeline.setFrameTimes([]);
      } else {
        // Probe for SAILS supplemental sweeps (tries multiple files)
        const { sweepCount, vcp: detectedVcp } = await probeSailsSweepCount(
          scans,
          selectedSite.lat,
          selectedSite.lon,
        );

        // Expand scan files with per-sweep entries if SAILS detected
        const finalScans = expandScansForSails(scans, sweepCount);

        if (sweepCount > 1) {
          console.log(`[EventPicker] SAILS detected: VCP ${detectedVcp}, ${sweepCount} sweeps/volume → ${finalScans.length} frames (was ${scans.length} volumes)`);
        } else {
          console.log(`[EventPicker] No SAILS: VCP ${detectedVcp}, ${scans.length} volumes`);
        }

        // Set timeline frames BEFORE scan files so RadarLayer's subscription
        // sees frameTimes populated when scanFiles change triggers render
        timeline.setFrameTimes(finalScans.map((s) => s.timestamp));
        store.setScanFiles(finalScans);
        store.setAvailableElevations([]);
        store.setElevationIndex(0);
      }
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to load scans');
    } finally {
      store.setLoading(false);
    }
  }, [selectedSite, date, startTime, endTime]);

  // Compute display info
  const volumeCount = scanFiles.length > 0 && scanFiles[0]?.sweepCount
    ? Math.ceil(scanFiles.length / scanFiles[0].sweepCount)
    : scanFiles.length;
  const hasSails = scanFiles.length > 0 && (scanFiles[0]?.sweepCount ?? 1) > 1;

  return (
      <div className="event-picker">
        <div className="field-row">
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="time-row">
          <div className="field-row">
            <label>Start{selectedSite ? ` (${getTimezoneAbbr(Date.now(), selectedSite.tz || 'UTC')})` : ''}</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="field-row">
            <label>End{selectedSite ? ` (${getTimezoneAbbr(Date.now(), selectedSite.tz || 'UTC')})` : ''}</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="site-search" ref={searchRef}>
          <label>Site</label>
          {selectedSite ? (
            <div className="site-selected">
              <span><strong>{selectedSite.id}</strong> - {selectedSite.name}</span>
              <button
                className="site-clear"
                onClick={() => useRadarStore.getState().setSelectedSite(null)}
                title="Clear site"
              >&times;</button>
            </div>
          ) : (
            <input
              type="text"
              placeholder="Search by ID or city (e.g. KTLX, Oklahoma)"
              value={siteQuery}
              onChange={(e) => { setSiteQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
            />
          )}
          {showResults && filteredStations.length > 0 && (
            <ul className="site-results">
              {filteredStations.map((s) => (
                <li key={s.properties.id} onClick={() => selectStation(s)}>
                  <strong>{s.properties.id}</strong> {s.properties.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          className="load-button"
          onClick={handleLoad}
          disabled={!selectedSite || loading}
        >
          {loading ? 'Loading...' : `Load Scans${selectedSite ? ` (${selectedSite.id})` : ''}`}
        </button>

        {error && <div className="error-message">{error}</div>}

        {scanFiles.length > 0 && (
          <div className="site-info">
            {hasSails ? (
              <>
                {scanFiles.length} frames ({volumeCount} volumes × {scanFiles[0].sweepCount} SAILS sweeps)
              </>
            ) : (
              <>{scanFiles.length} volume scans loaded</>
            )}
          </div>
        )}

        {scanFiles.length > 0 && (
          <button
            className="clear-all-btn"
            onClick={handleClearAll}
            title="Clear all data, overlays, and caches to start fresh"
          >
            Clear All
          </button>
        )}
      </div>
  );
}
