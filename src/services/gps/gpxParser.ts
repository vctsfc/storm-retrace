/**
 * GPX file parser.
 *
 * Parses GPX (GPS Exchange Format) XML files into track points
 * using the browser's built-in DOMParser. No external dependencies.
 *
 * GPX format:
 * <gpx>
 *   <trk>
 *     <name>Track Name</name>
 *     <trkseg>
 *       <trkpt lat="35.123" lon="-97.456">
 *         <ele>300</ele>
 *         <time>2025-04-27T20:15:00Z</time>
 *       </trkpt>
 *     </trkseg>
 *   </trk>
 * </gpx>
 */

export interface TrackPoint {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** UTC timestamp in milliseconds */
  time: number;
  /** Elevation in meters (optional) */
  elevation?: number;
}

export interface ParsedTrack {
  /** Track name from GPX <name> element, or null */
  name: string | null;
  /** Sorted array of track points */
  points: TrackPoint[];
}

/**
 * Parse a GPX XML string into one or more tracks.
 *
 * Handles:
 * - Multiple <trk> elements
 * - Multiple <trkseg> within a <trk> (concatenated)
 * - Optional <ele> and <time> child elements
 * - Points without timestamps are skipped (time-sync requires timestamps)
 *
 * @throws Error if the XML is invalid or contains no valid track points
 */
export function parseGPX(xmlText: string): ParsedTrack[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Invalid GPX file: ${parseError.textContent?.slice(0, 100)}`);
  }

  const tracks: ParsedTrack[] = [];
  const trkElements = doc.querySelectorAll('trk');

  if (trkElements.length === 0) {
    throw new Error('No tracks found in GPX file');
  }

  for (const trk of trkElements) {
    const nameEl = trk.querySelector('name');
    const name = nameEl?.textContent?.trim() ?? null;

    const points: TrackPoint[] = [];

    // Collect all trkpt elements from all trkseg within this trk
    const trkpts = trk.querySelectorAll('trkseg > trkpt');

    for (const trkpt of trkpts) {
      const latStr = trkpt.getAttribute('lat');
      const lonStr = trkpt.getAttribute('lon');
      if (!latStr || !lonStr) continue;

      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (!isFinite(lat) || !isFinite(lon)) continue;

      // Parse time (required for time-synced animation)
      const timeEl = trkpt.querySelector('time');
      if (!timeEl?.textContent) continue;

      const time = new Date(timeEl.textContent.trim()).getTime();
      if (isNaN(time)) continue;

      // Parse elevation (optional)
      const eleEl = trkpt.querySelector('ele');
      let elevation: number | undefined;
      if (eleEl?.textContent) {
        const ele = parseFloat(eleEl.textContent.trim());
        if (isFinite(ele)) elevation = ele;
      }

      points.push({ lat, lon, time, elevation });
    }

    if (points.length === 0) continue;

    // Sort by timestamp
    points.sort((a, b) => a.time - b.time);

    tracks.push({ name, points });
  }

  if (tracks.length === 0) {
    throw new Error('No valid track points with timestamps found in GPX file');
  }

  console.log(
    `[GPX] Parsed ${tracks.length} track(s): ${tracks.map((t) => `"${t.name ?? 'Unnamed'}" (${t.points.length} pts)`).join(', ')}`,
  );

  return tracks;
}
