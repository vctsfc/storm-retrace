/**
 * Fetch tornado damage survey tracks from the NWS Damage Assessment Toolkit (DAT).
 *
 * Uses the ArcGIS FeatureServer REST API:
 *   Layer 1 = tornado track polylines (surveyed paths with EF ratings)
 *
 * The service returns native GeoJSON, supports SQL date filtering,
 * and requires no authentication.
 */

const DAT_BASE_URL =
  'https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer';

/** Layer 1 = tornado track lines */
const TORNADO_TRACKS_LAYER = 1;
const PAGE_SIZE = 2000;

/**
 * Format a Date as an ArcGIS-compatible date string: 'YYYY-MM-DD'.
 */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Fetch tornado damage survey tracks for a given time range.
 *
 * Expands the range by ±1 day to catch storms near midnight UTC.
 * Paginates through results if > PAGE_SIZE records exist.
 * Returns a GeoJSON FeatureCollection (empty if no tracks found).
 */
export async function fetchTornadoTracks(
  startMs: number,
  endMs: number,
): Promise<GeoJSON.FeatureCollection> {
  // Expand ±1 day for coverage
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const startDate = new Date(startMs - ONE_DAY_MS);
  const endDate = new Date(endMs + ONE_DAY_MS);

  const where = `Survey_Start_Date >= '${formatDate(startDate)}' AND Survey_Start_Date <= '${formatDate(endDate)}'`;

  const allFeatures: GeoJSON.Feature[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      where,
      outFields: '*',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });

    const url = `${DAT_BASE_URL}/${TORNADO_TRACKS_LAYER}/query?${params}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DAT API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.features && Array.isArray(data.features)) {
      allFeatures.push(...data.features);
    }

    // ArcGIS signals more pages via exceededTransferLimit
    if (data.exceededTransferLimit) {
      offset += PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  console.log(`[TornadoTracks] Fetched ${allFeatures.length} tracks from NWS DAT`);

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
}
