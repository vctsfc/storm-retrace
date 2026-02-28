import { useEffect, useRef } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useOverlayStore } from '../stores/overlayStore';
import { useRadarStore } from '../stores/radarStore';
import { fetchWarnings } from '../services/overlays/warningsService';
import { fetchWatches } from '../services/overlays/watchesService';
import { fetchMCDs } from '../services/overlays/mcdService';
import { fetchOutlook } from '../services/overlays/outlooksService';
import { fetchLSRs } from '../services/overlays/lsrService';
import { fetchNearbyStations, fetchObservations } from '../services/overlays/asosService';
import { fetchTornadoTracks } from '../services/overlays/tornadoTracksService';

/**
 * Format a UTC millisecond timestamp as the SPC convective-day date (YYYY-MM-DD).
 *
 * SPC convective days run 12Z–12Z. A storm at 02:00 UTC on May 21 belongs to
 * the May 20 convective day. We subtract 12 hours before extracting the UTC
 * date so that any timestamp between 12Z day-N and 12Z day-N+1 maps to day-N.
 */
function formatConvectiveDay(ms: number): string {
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const d = new Date(ms - TWELVE_HOURS_MS);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Hook that watches for new event loads (frameTimes populated) and
 * triggers overlay data fetches for all overlay types concurrently.
 * Activated once in AppShell.
 *
 * Detects event changes by tracking the first+last frame timestamps,
 * not just the frame count. This ensures overlays are re-fetched when
 * switching between events (e.g. KTLX 2013 -> KLNX 2025) even if
 * frameTimes never goes through an empty state.
 */
export function useTimeSyncedOverlays() {
  const prevStartRef = useRef<number | null>(null);
  const prevEndRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const unsub = useTimelineStore.subscribe((state) => {
      const { frameTimes } = state;
      const frameCount = frameTimes.length;

      if (frameCount > 0) {
        const startMs = frameTimes[0];
        const endMs = frameTimes[frameCount - 1];

        // Trigger fetch when event time range changes (new event loaded)
        if (startMs !== prevStartRef.current || endMs !== prevEndRef.current) {
          prevStartRef.current = startMs;
          prevEndRef.current = endMs;

          // Guard against duplicate concurrent fetches
          if (fetchingRef.current) return;
          fetchingRef.current = true;

          const overlay = useOverlayStore.getState();
          overlay.clearAllOverlays();

          // Set all loading flags
          overlay.setWarningsLoading(true);
          overlay.setWatchesLoading(true);
          overlay.setMCDsLoading(true);
          overlay.setOutlooksLoading(true);
          overlay.setLSRsLoading(true);
          overlay.setSurfaceObsLoading(true);
          overlay.setTornadoTracksLoading(true);

          // Compute outlook date from event start (convective day = 12Z–12Z)
          const outlookDate = formatConvectiveDay(startMs);

          // Fire all fetches concurrently — each handles its own success/error
          const warningsP = fetchWarnings(startMs, endMs)
            .then((w) => {
              useOverlayStore.getState().setWarnings(w);
              console.log(`[Overlays] ${w.length} warnings`);
            })
            .catch((e) => {
              useOverlayStore.getState().setWarningsError(
                e instanceof Error ? e.message : 'Failed to fetch warnings',
              );
            })
            .finally(() => {
              useOverlayStore.getState().setWarningsLoading(false);
            });

          const watchesP = fetchWatches(startMs, endMs)
            .then((w) => {
              useOverlayStore.getState().setWatches(w);
              console.log(`[Overlays] ${w.length} watches`);
            })
            .catch((e) => {
              useOverlayStore.getState().setWatchesError(
                e instanceof Error ? e.message : 'Failed to fetch watches',
              );
            })
            .finally(() => {
              useOverlayStore.getState().setWatchesLoading(false);
            });

          const mcdsP = fetchMCDs(startMs, endMs)
            .then((m) => {
              useOverlayStore.getState().setMCDs(m);
              console.log(`[Overlays] ${m.length} MCDs`);
            })
            .catch((e) => {
              useOverlayStore.getState().setMCDsError(
                e instanceof Error ? e.message : 'Failed to fetch MCDs',
              );
            })
            .finally(() => {
              useOverlayStore.getState().setMCDsLoading(false);
            });

          const outlooksP = fetchOutlook(outlookDate)
            .then((o) => {
              useOverlayStore.getState().setOutlooks(o);
              console.log(`[Overlays] ${o.length} outlook areas`);
            })
            .catch((e) => {
              useOverlayStore.getState().setOutlooksError(
                e instanceof Error ? e.message : 'Failed to fetch outlooks',
              );
            })
            .finally(() => {
              useOverlayStore.getState().setOutlooksLoading(false);
            });

          const lsrsP = fetchLSRs(startMs, endMs)
            .then((l) => {
              useOverlayStore.getState().setLSRs(l);
              console.log(`[Overlays] ${l.length} LSRs`);
            })
            .catch((e) => {
              useOverlayStore.getState().setLSRsError(
                e instanceof Error ? e.message : 'Failed to fetch LSRs',
              );
            })
            .finally(() => {
              useOverlayStore.getState().setLSRsLoading(false);
            });

          // Tornado tracks from NWS DAT (no time-sync, just fetch once)
          const tornadoTracksP = fetchTornadoTracks(startMs, endMs)
            .then((fc) => {
              useOverlayStore.getState().setTornadoTracks(fc);
              console.log(`[Overlays] ${fc.features.length} tornado tracks`);
            })
            .catch((e) => {
              useOverlayStore.getState().setTornadoTracksError(
                e instanceof Error ? e.message : 'Failed to fetch tornado tracks',
              );
            })
            .finally(() => {
              useOverlayStore.getState().setTornadoTracksLoading(false);
            });

          // Surface observations — discover stations near all radar sites, then fetch obs
          // In multi-site mode, fetch nearby stations for each segment site (deduplicated)
          const radarState = useRadarStore.getState();
          const selectedSite = radarState.selectedSite;
          const segments = radarState.segments;
          const sites = segments.length > 0
            ? segments.map((s) => s.site)
            : selectedSite ? [selectedSite] : [];

          const surfaceObsP = sites.length > 0
            ? Promise.all(sites.map((site) => fetchNearbyStations(site.lat, site.lon, 230)))
                .then((stationArrays) => {
                  // Deduplicate stations by ID
                  const seen = new Set<string>();
                  const allStations = stationArrays.flat().filter((s) => {
                    if (seen.has(s.id)) return false;
                    seen.add(s.id);
                    return true;
                  });
                  useOverlayStore.getState().setSurfaceObsStations(allStations);
                  return fetchObservations(allStations, startMs, endMs);
                })
                .then((obs) => {
                  useOverlayStore.getState().setSurfaceObs(obs);
                  console.log(`[Overlays] ${obs.length} surface observations`);
                })
                .catch((e) => {
                  useOverlayStore.getState().setSurfaceObsError(
                    e instanceof Error ? e.message : 'Failed to fetch surface obs',
                  );
                })
                .finally(() => {
                  useOverlayStore.getState().setSurfaceObsLoading(false);
                })
            : Promise.resolve().then(() => {
                useOverlayStore.getState().setSurfaceObsLoading(false);
              });

          Promise.all([warningsP, watchesP, mcdsP, outlooksP, lsrsP, surfaceObsP, tornadoTracksP]).finally(
            () => {
              fetchingRef.current = false;
            },
          );
        }
      } else {
        // Clear when frames go back to 0 (event unloaded)
        if (prevStartRef.current !== null) {
          prevStartRef.current = null;
          prevEndRef.current = null;
          useOverlayStore.getState().clearAllOverlays();
        }
      }
    });

    return unsub;
  }, []);
}
