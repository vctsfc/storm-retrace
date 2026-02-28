/**
 * ASOS/METAR surface observation service.
 *
 * Fetches nearby ASOS stations and their observation histories from IEM.
 *
 * Station discovery: IEM uses state-based networks (`OK_ASOS`, `KS_ASOS`, etc.).
 * We determine which states overlap the search radius, fetch each network,
 * then filter by haversine distance.
 *
 * Observation history: `/api/1/obhistory.json?station={ID}&network={NET}&date={YYYY-MM-DD}`
 * → hourly observations with temp, dewpoint, wind, pressure.
 */

import { haversineDistance } from '../../utils/geo';
import { getIEMBaseUrl } from '../../utils/baseUrl';
import type { ASOSStation, SurfaceObservation } from '../../stores/overlayStore';

const MAX_CONCURRENT_FETCHES = 5;

/**
 * Approximate bounding boxes for US states [minLat, maxLat, minLon, maxLon].
 * Used to determine which state ASOS networks to query.
 */
const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  AL: [30.2, 35.0, -88.5, -84.9],
  AR: [33.0, 36.5, -94.6, -89.6],
  AZ: [31.3, 37.0, -114.8, -109.0],
  CA: [32.5, 42.0, -124.4, -114.1],
  CO: [37.0, 41.0, -109.1, -102.0],
  CT: [41.0, 42.1, -73.7, -71.8],
  DE: [38.5, 39.8, -75.8, -75.0],
  FL: [24.5, 31.0, -87.6, -80.0],
  GA: [30.4, 35.0, -85.6, -80.8],
  IA: [40.4, 43.5, -96.6, -90.1],
  ID: [42.0, 49.0, -117.2, -111.0],
  IL: [37.0, 42.5, -91.5, -87.5],
  IN: [37.8, 41.8, -88.1, -84.8],
  KS: [37.0, 40.0, -102.1, -94.6],
  KY: [36.5, 39.1, -89.6, -81.9],
  LA: [29.0, 33.0, -94.0, -89.0],
  MA: [41.2, 42.9, -73.5, -69.9],
  MD: [38.0, 39.7, -79.5, -75.0],
  ME: [43.1, 47.5, -71.1, -67.0],
  MI: [41.7, 48.3, -90.4, -82.4],
  MN: [43.5, 49.4, -97.2, -89.5],
  MO: [36.0, 40.6, -95.8, -89.1],
  MS: [30.2, 35.0, -91.7, -88.1],
  MT: [44.4, 49.0, -116.0, -104.0],
  NC: [33.8, 36.6, -84.3, -75.5],
  ND: [45.9, 49.0, -104.0, -96.6],
  NE: [40.0, 43.0, -104.1, -95.3],
  NH: [42.7, 45.3, -72.6, -70.7],
  NJ: [38.9, 41.4, -75.6, -73.9],
  NM: [31.3, 37.0, -109.0, -103.0],
  NV: [35.0, 42.0, -120.0, -114.0],
  NY: [40.5, 45.0, -79.8, -71.9],
  OH: [38.4, 42.0, -84.8, -80.5],
  OK: [33.6, 37.0, -103.0, -94.4],
  OR: [42.0, 46.3, -124.6, -116.5],
  PA: [39.7, 42.3, -80.5, -74.7],
  RI: [41.1, 42.0, -71.9, -71.1],
  SC: [32.0, 35.2, -83.4, -78.5],
  SD: [42.5, 46.0, -104.1, -96.4],
  TN: [35.0, 36.7, -90.3, -81.6],
  TX: [25.8, 36.5, -106.6, -93.5],
  UT: [37.0, 42.0, -114.1, -109.0],
  VA: [36.5, 39.5, -83.7, -75.2],
  VT: [42.7, 45.0, -73.4, -71.5],
  WA: [45.5, 49.0, -124.8, -116.9],
  WI: [42.5, 47.1, -92.9, -86.8],
  WV: [37.2, 40.6, -82.6, -77.7],
  WY: [41.0, 45.0, -111.1, -104.1],
};

/** Cache stations per network (persist across event loads) */
const networkCache = new Map<string, ASOSStation[]>();

/**
 * Parse an IEM ASOS network GeoJSON response into ASOSStation objects.
 */
function parseStationGeoJSON(geojson: any): ASOSStation[] {
  const stations: ASOSStation[] = [];
  for (const feature of geojson.features ?? []) {
    const props = feature.properties;
    const coords = feature.geometry?.coordinates;
    if (!props || !coords) continue;
    if (!props.archive_begin) continue;

    stations.push({
      id: props.sid ?? props.id ?? '',
      name: props.sname ?? props.station_name ?? '',
      lat: coords[1],
      lon: coords[0],
      network: props.network ?? '',
      elevation: props.elevation ?? 0,
    });
  }
  return stations;
}

/**
 * Determine which state ASOS networks overlap a bounding box.
 */
function getOverlappingStateNetworks(
  lat: number,
  lon: number,
  radiusKm: number,
): string[] {
  // ~1 degree lat ≈ 111km, ~1 degree lon ≈ 111km * cos(lat)
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - dLat;
  const maxLat = lat + dLat;
  const minLon = lon - dLon;
  const maxLon = lon + dLon;

  const networks: string[] = [];
  for (const [state, [sMinLat, sMaxLat, sMinLon, sMaxLon]] of Object.entries(STATE_BOUNDS)) {
    // Check bounding box overlap
    if (maxLat >= sMinLat && minLat <= sMaxLat && maxLon >= sMinLon && minLon <= sMaxLon) {
      networks.push(`${state}_ASOS`);
    }
  }
  return networks;
}

/**
 * Fetch ASOS stations near a point from IEM state-based networks.
 * Caches each network's station list for the session.
 */
export async function fetchNearbyStations(
  lat: number,
  lon: number,
  radiusKm = 200,
): Promise<ASOSStation[]> {
  const networks = getOverlappingStateNetworks(lat, lon, radiusKm);
  console.log(`[ASOS] Querying ${networks.length} state networks: ${networks.join(', ')}`);

  // Fetch any uncached networks
  const toFetch = networks.filter((n) => !networkCache.has(n));
  if (toFetch.length > 0) {
    const results = await Promise.all(
      toFetch.map(async (network) => {
        try {
          const url = `${getIEMBaseUrl()}/geojson/network/${network}.geojson`;
          const resp = await fetch(url);
          if (!resp.ok) return { network, stations: [] as ASOSStation[] };
          const geojson = await resp.json();
          return { network, stations: parseStationGeoJSON(geojson) };
        } catch {
          return { network, stations: [] as ASOSStation[] };
        }
      }),
    );
    for (const { network, stations } of results) {
      networkCache.set(network, stations);
    }
  }

  // Collect all stations from relevant networks, filter by distance
  const allStations: ASOSStation[] = [];
  for (const network of networks) {
    const stations = networkCache.get(network);
    if (stations) allStations.push(...stations);
  }

  // Filter by distance and sort by proximity, cap at 50 nearest
  const MAX_STATIONS = 50;
  const withDist = allStations
    .map((s) => ({ station: s, dist: haversineDistance(lat, lon, s.lat, s.lon) }))
    .filter((s) => s.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist);

  const nearby = withDist.slice(0, MAX_STATIONS).map((s) => s.station);

  console.log(`[ASOS] ${nearby.length} stations within ${radiusKm}km of [${lat.toFixed(2)}, ${lon.toFixed(2)}] (${withDist.length} total, capped at ${MAX_STATIONS})`);
  return nearby;
}

/**
 * Format a UTC timestamp as YYYY-MM-DD for the IEM obhistory API.
 */
function formatDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Get unique date strings spanning a time range.
 */
function getDateRange(startMs: number, endMs: number): string[] {
  const dates = new Set<string>();
  // Start from midnight of start date
  const d = new Date(startMs);
  d.setUTCHours(0, 0, 0, 0);

  while (d.getTime() <= endMs) {
    dates.add(formatDate(d.getTime()));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return [...dates];
}

/**
 * Fetch observation history for a single station on a single date.
 */
async function fetchStationDay(
  station: ASOSStation,
  dateStr: string,
): Promise<SurfaceObservation[]> {
  const url = `${getIEMBaseUrl()}/api/1/obhistory.json?station=${encodeURIComponent(station.id)}&network=${encodeURIComponent(station.network)}&date=${dateStr}`;

  const resp = await fetch(url);
  if (!resp.ok) return []; // Silently skip failed stations

  const json = await resp.json();
  const data = json.data;
  if (!Array.isArray(data)) return [];

  // Build column index from schema
  const schema = json.schema?.fields;
  const colIndex: Record<string, number> = {};
  if (Array.isArray(schema)) {
    for (let i = 0; i < schema.length; i++) {
      colIndex[schema[i].name] = i;
    }
  }

  const obs: SurfaceObservation[] = [];

  for (const row of data) {
    // Data is an array of arrays (Pandas orient=split format)
    // or it could be an array of objects — handle both
    let utcValid: string | null = null;
    let tmpf: number | null = null;
    let dwpf: number | null = null;
    let drct: number | null = null;
    let sknt: number | null = null;
    let gust: number | null = null;
    let mslp: number | null = null;
    let skyc1: string | null = null;

    if (Array.isArray(row)) {
      // Array format (orient=split)
      utcValid = row[colIndex['utc_valid']] ?? null;
      tmpf = row[colIndex['tmpf']] ?? null;
      dwpf = row[colIndex['dwpf']] ?? null;
      drct = row[colIndex['drct']] ?? null;
      sknt = row[colIndex['sknt']] ?? null;
      gust = row[colIndex['gust']] ?? null;
      mslp = row[colIndex['mslp']] ?? null;
      skyc1 = row[colIndex['skyc1']] ?? null;
    } else if (row && typeof row === 'object') {
      // Object format
      utcValid = row.utc_valid ?? null;
      tmpf = row.tmpf ?? null;
      dwpf = row.dwpf ?? null;
      drct = row.drct ?? null;
      sknt = row.sknt ?? null;
      gust = row.gust ?? null;
      mslp = row.mslp ?? null;
      skyc1 = row.skyc1 ?? null;
    }

    if (!utcValid) continue;

    // Parse timestamp — IEM format: "2013-05-20T05:52:00+00:00" or similar
    const ts = new Date(utcValid).getTime();
    if (isNaN(ts)) continue;

    // Skip rows where both temp and wind are missing
    if (tmpf == null && sknt == null) continue;

    obs.push({
      station: station.id,
      lat: station.lat,
      lon: station.lon,
      utcValid: ts,
      tmpf: typeof tmpf === 'number' && isFinite(tmpf) ? tmpf : null,
      dwpf: typeof dwpf === 'number' && isFinite(dwpf) ? dwpf : null,
      drct: typeof drct === 'number' && isFinite(drct) ? drct : null,
      sknt: typeof sknt === 'number' && isFinite(sknt) ? sknt : null,
      gust: typeof gust === 'number' && isFinite(gust) ? gust : null,
      mslp: typeof mslp === 'number' && isFinite(mslp) ? mslp : null,
      skyc1: typeof skyc1 === 'string' ? skyc1 : null,
    });
  }

  return obs;
}

/**
 * Fetch surface observations for all nearby stations across an event time range.
 * Uses concurrent fetches with a concurrency limit.
 */
export async function fetchObservations(
  stations: ASOSStation[],
  startMs: number,
  endMs: number,
): Promise<SurfaceObservation[]> {
  const dates = getDateRange(startMs, endMs);

  // Build list of all (station, date) pairs
  const jobs: { station: ASOSStation; date: string }[] = [];
  for (const station of stations) {
    for (const date of dates) {
      jobs.push({ station, date });
    }
  }

  console.log(`[ASOS] Fetching ${jobs.length} station-day observation sets (${stations.length} stations × ${dates.length} days)`);

  // Process with concurrency limit
  const allObs: SurfaceObservation[] = [];
  let i = 0;

  while (i < jobs.length) {
    const batch = jobs.slice(i, i + MAX_CONCURRENT_FETCHES);
    const results = await Promise.all(
      batch.map((job) => fetchStationDay(job.station, job.date).catch(() => [])),
    );
    for (const obs of results) {
      allObs.push(...obs);
    }
    i += MAX_CONCURRENT_FETCHES;
  }

  // Deduplicate by station + timestamp
  const seen = new Set<string>();
  const deduped = allObs.filter((o) => {
    const key = `${o.station}_${o.utcValid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by station then time
  deduped.sort((a, b) => a.station.localeCompare(b.station) || a.utcValid - b.utcValid);

  console.log(`[ASOS] ${deduped.length} total observations (${allObs.length} before dedup)`);
  return deduped;
}
