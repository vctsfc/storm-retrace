import type { SPCWatch } from '../../stores/overlayStore';
import { getIEMBaseUrl } from '../../utils/baseUrl';

/**
 * Parse an SPC timestamp string (YYYYMMDDHHmm) to UTC milliseconds.
 */
function parseSPCTimestamp(s: string): number {
  const y = parseInt(s.slice(0, 4), 10);
  const mo = parseInt(s.slice(4, 6), 10) - 1;
  const d = parseInt(s.slice(6, 8), 10);
  const h = parseInt(s.slice(8, 10), 10);
  const mi = parseInt(s.slice(10, 12), 10);
  return Date.UTC(y, mo, d, h, mi, 0);
}

/**
 * Fetch SPC watch polygons from the IEM API for a given time range.
 * Returns Tornado Watches (TOR) and Severe Thunderstorm Watches (SVR).
 *
 * The IEM endpoint expects ISO 8601 date strings for sts/ets.
 */
export async function fetchWatches(
  startMs: number,
  endMs: number,
): Promise<SPCWatch[]> {
  const sts = new Date(startMs).toISOString();
  const ets = new Date(endMs).toISOString();

  const url = `${getIEMBaseUrl()}/cgi-bin/request/gis/spc_watch.py?sts=${sts}&ets=${ets}&format=geojson`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch watches: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  let geojson: any;
  try {
    geojson = JSON.parse(text);
  } catch {
    // IEM may return plain-text error messages instead of JSON
    console.warn('[watches] Non-JSON response:', text.slice(0, 200));
    return [];
  }
  if (!geojson.features || !Array.isArray(geojson.features)) {
    return [];
  }

  const watches: SPCWatch[] = [];

  for (const feature of geojson.features) {
    const p = feature.properties;
    if (!p) continue;

    const type = p.TYPE as string;
    if (type !== 'TOR' && type !== 'SVR') continue;

    watches.push({
      id: `${type}-${p.NUM}`,
      type: type as 'TOR' | 'SVR',
      num: typeof p.NUM === 'number' ? p.NUM : parseInt(p.NUM, 10),
      issue: parseSPCTimestamp(String(p.ISSUE)),
      expire: parseSPCTimestamp(String(p.EXPIRE)),
      is_pds: p.IS_PDS === true || p.IS_PDS === 'true' || p.IS_PDS === 1,
      geometry: feature.geometry,
    });
  }

  return watches;
}
