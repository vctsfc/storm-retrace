import type { MesoscaleDiscussion } from '../../stores/overlayStore';
import { getIEMBaseUrl } from '../../utils/baseUrl';

/** Sample interval for MCD polling (30 minutes) */
const SAMPLE_INTERVAL_MS = 30 * 60 * 1000;

/** Max concurrent requests to avoid hammering IEM */
const MAX_CONCURRENCY = 3;

/**
 * Fetch SPC Mesoscale Discussions from the IEM API for a given time range.
 *
 * The IEM MCD endpoint only accepts a single `valid` timestamp and returns
 * MDs active at that instant. To cover the full event range, we sample every
 * 30 minutes and deduplicate by MCD number.
 */
export async function fetchMCDs(
  startMs: number,
  endMs: number,
): Promise<MesoscaleDiscussion[]> {
  // Generate sample timestamps every 30 minutes
  const sampleTimes: number[] = [];
  for (let t = startMs; t <= endMs; t += SAMPLE_INTERVAL_MS) {
    sampleTimes.push(t);
  }
  // Always include the end time
  if (sampleTimes.length === 0 || sampleTimes[sampleTimes.length - 1] !== endMs) {
    sampleTimes.push(endMs);
  }

  // Deduplicate by year-num key
  const seen = new Map<string, MesoscaleDiscussion>();

  // Fetch with concurrency limit
  const queue = [...sampleTimes];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < MAX_CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const t = queue.shift()!;
          try {
            const mcds = await fetchMCDsAtTime(t);
            for (const mcd of mcds) {
              const key = `${mcd.year}-${mcd.num}`;
              // Keep latest version if MCD was reissued
              const existing = seen.get(key);
              if (!existing || mcd.issue > existing.issue) {
                seen.set(key, mcd);
              }
            }
          } catch {
            // Silently skip failed fetches for individual timestamps
          }
        }
      })(),
    );
  }

  await Promise.all(workers);

  return Array.from(seen.values());
}

/**
 * Fetch MDs active at a specific point in time.
 */
async function fetchMCDsAtTime(timeMs: number): Promise<MesoscaleDiscussion[]> {
  const valid = new Date(timeMs).toISOString();
  const url = `${getIEMBaseUrl()}/api/1/nws/spc_mcd.geojson?valid=${encodeURIComponent(valid)}`;

  const response = await fetch(url);
  if (!response.ok) return [];

  const geojson = await response.json();
  if (!geojson.features || !Array.isArray(geojson.features)) return [];

  const mcds: MesoscaleDiscussion[] = [];

  for (const feature of geojson.features) {
    const p = feature.properties;
    if (!p) continue;

    mcds.push({
      id: `MCD-${p.year}-${p.num}`,
      num: p.num,
      year: p.year,
      issue: new Date(p.issue).getTime(),
      expire: new Date(p.expire).getTime(),
      watch_confidence: p.watch_confidence ?? null,
      concerning: p.concerning ?? '',
      geometry: feature.geometry,
    });
  }

  return mcds;
}
