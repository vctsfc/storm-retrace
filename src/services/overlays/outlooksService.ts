import type { ConvectiveOutlook } from '../../stores/overlayStore';
import { getIEMBaseUrl } from '../../utils/baseUrl';

/** Day 1 outlook cycles in reverse order (try latest first) */
const CYCLES = [20, 16, 13, 6, 1];

/** Valid categorical threshold codes */
const VALID_THRESHOLDS = new Set(['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH']);

/**
 * Fetch the latest SPC Day 1 Convective Outlook from the IEM API.
 *
 * Tries cycles in reverse order (latest first) and returns the first
 * issuance that contains valid data. Only returns CATEGORICAL features
 * (not probabilistic tornado/wind/hail).
 *
 * @param dateStr - Date in YYYY-MM-DD format (UTC)
 */
export async function fetchOutlook(
  dateStr: string,
): Promise<ConvectiveOutlook[]> {
  for (const cycle of CYCLES) {
    try {
      const url = `${getIEMBaseUrl()}/api/1/nws/spc_outlook.geojson?day=1&valid=${dateStr}&cycle=${cycle}&outlook_type=C`;
      const response = await fetch(url);
      if (!response.ok) continue;

      const geojson = await response.json();
      if (!geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
        continue;
      }

      const outlooks = parseOutlookFeatures(geojson.features);
      if (outlooks.length > 0) return outlooks;
    } catch {
      // Try next cycle
    }
  }

  return [];
}

/**
 * Parse GeoJSON features into ConvectiveOutlook objects.
 * Filters to CATEGORICAL category only.
 */
function parseOutlookFeatures(features: any[]): ConvectiveOutlook[] {
  const outlooks: ConvectiveOutlook[] = [];

  for (const feature of features) {
    const p = feature.properties;
    if (!p) continue;

    // Only include categorical outlooks
    if (p.category !== 'CATEGORICAL') continue;

    const threshold = p.threshold as string;
    if (!VALID_THRESHOLDS.has(threshold)) continue;

    outlooks.push({
      id: `OTL-${threshold}`,
      threshold: threshold as ConvectiveOutlook['threshold'],
      category: p.category,
      issue: new Date(p.issue).getTime(),
      expire: new Date(p.expire).getTime(),
      geometry: feature.geometry,
    });
  }

  return outlooks;
}
