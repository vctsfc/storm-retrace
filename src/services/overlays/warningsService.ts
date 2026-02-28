import type { NWSWarning } from '../../stores/overlayStore';
import { getIEMBaseUrl } from '../../utils/baseUrl';

/** Only fetch these phenomena types */
const PHENOMENA_FILTER = new Set(['TO', 'SV', 'FF']);

/**
 * Fetch NWS storm-based warning polygons from the IEM API for a given time range.
 * Returns warnings filtered to Tornado (TO), Severe Thunderstorm (SV),
 * and Flash Flood (FF) with significance=W (Warning only).
 */
export async function fetchWarnings(
  startMs: number,
  endMs: number,
): Promise<NWSWarning[]> {
  const sts = new Date(startMs).toISOString();
  const ets = new Date(endMs).toISOString();

  const url = `${getIEMBaseUrl()}/geojson/sbw.geojson?sts=${encodeURIComponent(sts)}&ets=${encodeURIComponent(ets)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch warnings: ${response.status} ${response.statusText}`);
  }

  const geojson = await response.json();
  if (!geojson.features || !Array.isArray(geojson.features)) {
    return [];
  }

  const warnings: NWSWarning[] = [];

  for (const feature of geojson.features) {
    const p = feature.properties;
    if (!p) continue;

    // Filter to only the phenomena types we care about
    if (!PHENOMENA_FILTER.has(p.phenomena)) continue;
    // Only actual Warnings, not Advisories or Watches
    if (p.significance !== 'W') continue;

    warnings.push({
      id: `${p.wfo}-${p.phenomena}-${p.significance}-${p.eventid}`,
      phenomena: p.phenomena,
      significance: p.significance,
      wfo: p.wfo,
      eventid: p.eventid,
      issue: new Date(p.issue).getTime(),
      expire: new Date(p.expire).getTime(),
      status: p.status ?? 'NEW',
      is_emergency: p.is_emergency ?? false,
      is_pds: p.is_pds ?? false,
      hailtag: p.hailtag ?? null,
      windtag: p.windtag ?? null,
      geometry: feature.geometry,
    });
  }

  return warnings;
}
