/**
 * Radar geo-registration utilities.
 *
 * The actual decode + render pipeline is in renderLogic.ts (shared between
 * main thread and Web Workers) and radar.worker.ts (worker entry point).
 * This file only exports computeRadarBounds for use by RadarLayer.tsx.
 */

// ── Mercator projection helpers ─────────────────────────────────────

function latToMercatorY(lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

function mercatorYToLat(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
}

/**
 * Compute the geographic bounds for a radar image centered on a site.
 * Returns MapLibre ImageSource coordinates:
 * [[NW_lon, NW_lat], [NE_lon, NE_lat], [SE_lon, SE_lat], [SW_lon, SW_lat]]
 *
 * The latitude bounds are adjusted so that the Mercator midpoint of the
 * bounding box aligns with the site latitude. Without this correction,
 * the radar image appears shifted north because Mercator stretches the
 * northern half more than the southern half. The shift is proportional
 * to range: ~24 km for 460 km REF, ~11 km for 300 km VEL at 35°N.
 */
export function computeRadarBounds(
  siteLat: number,
  siteLon: number,
  rangeKm: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLon = 111.32 * Math.cos((siteLat * Math.PI) / 180);

  const dLat = rangeKm / kmPerDegreeLat;
  const dLon = rangeKm / kmPerDegreeLon;

  // Naive geographic bounds (symmetric in lat/lon around site)
  const naiveNorthLat = siteLat + dLat;
  const naiveSouthLat = siteLat - dLat;

  // Convert to Mercator Y to find the Mercator midpoint
  const siteY = latToMercatorY(siteLat);
  const northY = latToMercatorY(naiveNorthLat);
  const southY = latToMercatorY(naiveSouthLat);
  const midY = (northY + southY) / 2;

  // Shift bounds so the Mercator midpoint is at the site
  const offsetY = siteY - midY;
  const correctedNorthLat = mercatorYToLat(northY + offsetY);
  const correctedSouthLat = mercatorYToLat(southY + offsetY);

  return [
    [siteLon - dLon, correctedNorthLat], // top-left (NW)
    [siteLon + dLon, correctedNorthLat], // top-right (NE)
    [siteLon + dLon, correctedSouthLat], // bottom-right (SE)
    [siteLon - dLon, correctedSouthLat], // bottom-left (SW)
  ];
}
