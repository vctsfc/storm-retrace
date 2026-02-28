import type { NexradSite } from '../stores/radarStore';

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate Haversine distance between two points in km.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Find the nearest NEXRAD site to a given lat/lon.
 */
export function findNearestSite(
  lat: number,
  lon: number,
  sites: NexradSite[],
): NexradSite | null {
  if (sites.length === 0) return null;

  let nearest = sites[0];
  let minDist = haversineDistance(lat, lon, nearest.lat, nearest.lon);

  for (let i = 1; i < sites.length; i++) {
    const dist = haversineDistance(lat, lon, sites[i].lat, sites[i].lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = sites[i];
    }
  }

  return nearest;
}

/**
 * Calculate bearing (heading) in degrees from point 1 to point 2.
 * Returns 0-360, where 0 = north, 90 = east, etc.
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) * (180 / Math.PI);
  return (bearing + 360) % 360;
}

/**
 * Convert bearing degrees to cardinal direction string.
 */
export function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/** Convert kilometers to miles. */
export function kmToMiles(km: number): number {
  return km * 0.621371;
}

/**
 * Compute geographic bounds for a radar image centered on a site.
 * Returns MapLibre-compatible coordinates:
 * [[NW_lon, NW_lat], [NE_lon, NE_lat], [SE_lon, SE_lat], [SW_lon, SW_lat]]
 */
export function computeRadarBounds(
  siteLat: number,
  siteLon: number,
  rangeKm: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLon = 111.32 * Math.cos(toRad(siteLat));

  const dLat = rangeKm / kmPerDegreeLat;
  const dLon = rangeKm / kmPerDegreeLon;

  return [
    [siteLon - dLon, siteLat + dLat], // top-left (NW)
    [siteLon + dLon, siteLat + dLat], // top-right (NE)
    [siteLon + dLon, siteLat - dLat], // bottom-right (SE)
    [siteLon - dLon, siteLat - dLat], // bottom-left (SW)
  ];
}
