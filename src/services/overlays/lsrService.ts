import type { LocalStormReport } from '../../stores/overlayStore';
import { getIEMBaseUrl } from '../../utils/baseUrl';

/**
 * Fetch Local Storm Reports from the IEM API for a given time range.
 * Returns all LSR types (tornado, hail, wind, flood, funnel cloud, etc.).
 */
export async function fetchLSRs(
  startMs: number,
  endMs: number,
): Promise<LocalStormReport[]> {
  const sts = new Date(startMs).toISOString();
  const ets = new Date(endMs).toISOString();

  const url = `${getIEMBaseUrl()}/geojson/lsr.geojson?sts=${encodeURIComponent(sts)}&ets=${encodeURIComponent(ets)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch LSRs: ${response.status} ${response.statusText}`);
  }

  const geojson = await response.json();
  if (!geojson.features || !Array.isArray(geojson.features)) {
    return [];
  }

  const lsrs: LocalStormReport[] = [];

  for (const feature of geojson.features) {
    const p = feature.properties;
    if (!p || !feature.geometry) continue;

    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) continue;

    const validMs = new Date(p.valid).getTime();
    if (isNaN(validMs)) continue;

    lsrs.push({
      id: `LSR-${validMs}-${coords[1].toFixed(4)}-${coords[0].toFixed(4)}`,
      type: p.type ?? '',
      typetext: p.typetext ?? '',
      magnitude: typeof p.magf === 'number' ? p.magf : null,
      valid: validMs,
      lat: coords[1],
      lon: coords[0],
      city: p.city ?? '',
      county: p.county ?? '',
      state: p.state ?? p.st ?? '',
      source: p.source ?? '',
      remark: p.remark ?? '',
      geometry: feature.geometry,
    });
  }

  return lsrs;
}
