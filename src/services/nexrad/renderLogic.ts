/**
 * Pure rendering logic for NEXRAD radar data.
 * This module has NO DOM dependencies — it works with both:
 *   - CanvasRenderingContext2D (main thread, document.createElement('canvas'))
 *   - OffscreenCanvasRenderingContext2D (Web Worker, new OffscreenCanvas())
 *
 * Extracted from renderer.ts so the radar.worker can import it directly.
 */

import { REF_COLOR_TABLE, VEL_COLOR_TABLE, type ColorStop } from './colorTables';

export const CANVAS_SIZE = 1800;

/**
 * Draw polar radar data onto a canvas context.
 *
 * nexrad-level-2-data separates azimuth angles from moment data:
 *   - azimuths: number[] (degrees, one per radial)
 *   - radials: array of { gate_count, first_gate (km), gate_size (km), moment_data: (number|null)[] }
 *
 * Gates are ~0.25km wide, which at 460km range on 1800px canvas = ~0.5px per gate.
 * We batch adjacent gates with the same color into single arcs for performance.
 */
export function drawPolarData(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  radials: any[],
  azimuths: number[],
  colorTable: ColorStop[],
  centerX: number,
  centerY: number,
  maxRadius: number,
  totalRangeKm: number,
) {
  if (!Array.isArray(radials) || radials.length === 0) return;

  const pxPerKm = maxRadius / totalRangeKm;
  const numRadials = radials.length;
  const DEG2RAD = Math.PI / 180;
  // Tiny angular overlap (radians) to eliminate sub-pixel gaps between adjacent arcs.
  // ~0.12° — invisible visually but enough to close floating-point seams.
  const OVERLAP = 0.002;

  for (let r = 0; r < numRadials; r++) {
    const radial = radials[r];
    const azimuth = azimuths[r];
    if (!radial || azimuth == null) continue;

    // Compute actual angular extent from neighboring azimuths so
    // adjacent radials share edges with no gaps.
    const prevAz = azimuths[(r - 1 + numRadials) % numRadials];
    const nextAz = azimuths[(r + 1) % numRadials];

    // Signed angular distance (degrees CW) with 360° wrapping
    let gapPrev = azimuth - prevAz;
    if (gapPrev > 180) gapPrev -= 360;
    if (gapPrev < -180) gapPrev += 360;

    let gapNext = nextAz - azimuth;
    if (gapNext > 180) gapNext -= 360;
    if (gapNext < -180) gapNext += 360;

    const halfPrevRad = (gapPrev / 2) * DEG2RAD;
    const halfNextRad = (gapNext / 2) * DEG2RAD;

    // Convert azimuth (CW from north) to canvas angle, negated for arc direction
    const azRad = (90 - azimuth) * DEG2RAD;
    const startAngle = -(azRad + halfPrevRad + OVERLAP);
    const endAngle = -(azRad - halfNextRad - OVERLAP);

    const gateData = radial.moment_data;
    if (!gateData) continue;

    const numGates = radial.gate_count;
    const firstGateKm = radial.first_gate;
    const gateSizeKm = radial.gate_size;

    // Batch adjacent gates with the same color
    let runStart = -1;
    let runColor: string | null = null;

    for (let g = 0; g <= numGates; g++) {
      const value = g < numGates ? gateData[g] : null;
      const color = (value !== null && value !== undefined)
        ? valueToColor(value, colorTable)
        : null;

      if (color === runColor && g < numGates) continue;

      // Flush the current run
      if (runColor && runStart >= 0) {
        const innerR = (firstGateKm + runStart * gateSizeKm) * pxPerKm;
        const outerR = (firstGateKm + g * gateSizeKm) * pxPerKm;

        ctx.beginPath();
        ctx.arc(centerX, centerY, outerR, startAngle, endAngle, false);
        ctx.arc(centerX, centerY, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = runColor;
        ctx.fill();
      }

      runStart = g;
      runColor = color;
    }
  }
}

/**
 * Map a radar value to an RGBA color string using a color table.
 *
 * Uses binary search (O(log n)) to find the bracket — important for
 * custom palettes which may have 100-200 pre-expanded gradient stops.
 */
export function valueToColor(value: number, colorTable: ColorStop[]): string | null {
  const len = colorTable.length;
  if (len === 0) return null;

  // Below minimum threshold
  if (value < colorTable[0].value) return null;

  // Binary search: find largest i where colorTable[i].value <= value
  let lo = 0;
  let hi = len - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1; // Round up to avoid infinite loop
    if (colorTable[mid].value <= value) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const stop = colorTable[lo];
  return `rgba(${stop.r}, ${stop.g}, ${stop.b}, ${stop.a})`;
}

// ── Bilinear interpolation types and helpers ──

export type SmoothingMode = 'none' | 'low' | 'high';

/**
 * Interpolate a radar value to RGBA using a color table.
 * Linearly interpolates R, G, B, A between bracketing ColorStop values
 * for smooth color gradients (vs step-wise lookup in valueToColor).
 *
 * Returns null if value is below the minimum threshold.
 */
function valueToRGBA(
  value: number,
  colorTable: ColorStop[],
): [number, number, number, number] | null {
  const len = colorTable.length;
  if (len === 0 || value < colorTable[0].value) return null;

  // Above max → clamp to last stop
  if (value >= colorTable[len - 1].value) {
    const s = colorTable[len - 1];
    return [s.r, s.g, s.b, s.a];
  }

  // Binary search: find largest i where colorTable[i].value <= value
  let lo = 0;
  let hi = len - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (colorTable[mid].value <= value) lo = mid;
    else hi = mid - 1;
  }

  const a = colorTable[lo];
  const b = colorTable[lo + 1];
  const range = b.value - a.value;
  if (range <= 0) return [a.r, a.g, a.b, a.a];

  const t = (value - a.value) / range;
  return [
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
    a.a + (b.a - a.a) * t,
  ];
}

/** Sorted azimuth index for O(log n) radial lookups. */
interface AzimuthIndex {
  sortedAzimuths: Float64Array;
  originalIndices: Uint16Array;
  count: number;
}

/** Build a sorted azimuth index from the raw azimuths array. */
function buildAzimuthIndex(azimuths: number[]): AzimuthIndex {
  const n = azimuths.length;
  const pairs: [number, number][] = new Array(n);
  for (let i = 0; i < n; i++) pairs[i] = [azimuths[i], i];
  pairs.sort((a, b) => a[0] - b[0]);

  const sortedAzimuths = new Float64Array(n);
  const originalIndices = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    sortedAzimuths[i] = pairs[i][0];
    originalIndices[i] = pairs[i][1];
  }
  return { sortedAzimuths, originalIndices, count: n };
}

/**
 * Find the two radials bracketing a query azimuth.
 * Returns [originalIndex1, originalIndex2, fraction] with 360° wraparound.
 */
function findBracketingRadials(
  queryAz: number,
  idx: AzimuthIndex,
): [number, number, number] {
  const { sortedAzimuths, originalIndices, count } = idx;

  // Wraparound: query below first or >= last
  if (queryAz < sortedAzimuths[0] || queryAz >= sortedAzimuths[count - 1]) {
    const az1 = sortedAzimuths[count - 1];
    const az2 = sortedAzimuths[0];
    const gap = az2 + 360 - az1;
    let dist = queryAz - az1;
    if (dist < 0) dist += 360;
    return [originalIndices[count - 1], originalIndices[0], gap > 0 ? dist / gap : 0];
  }

  // Binary search: largest i where sortedAzimuths[i] <= queryAz
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sortedAzimuths[mid] <= queryAz) lo = mid;
    else hi = mid - 1;
  }

  const az1 = sortedAzimuths[lo];
  const az2 = sortedAzimuths[lo + 1];
  const gap = az2 - az1;
  return [originalIndices[lo], originalIndices[lo + 1], gap > 0 ? (queryAz - az1) / gap : 0];
}

/** Safely read a gate value from a radial. Returns null if out-of-bounds or missing. */
function getGateValue(
  momentArrays: ((number | null)[] | null)[],
  radialIdx: number,
  gateIdx: number,
  gateCounts: Uint16Array,
): number | null {
  if (gateIdx < 0 || gateIdx >= gateCounts[radialIdx]) return null;
  const data = momentArrays[radialIdx];
  if (!data) return null;
  const v = data[gateIdx];
  return v !== null && v !== undefined ? (v as number) : null;
}

/**
 * Bilinear interpolation with null-aware fallback.
 * Uses weighted average of valid corners — at echo boundaries this
 * produces a natural fade rather than hard edges or 1px holes.
 */
function interpolateWithNulls(
  v00: number | null, v01: number | null,
  v10: number | null, v11: number | null,
  s: number, t: number,
): number | null {
  const w00 = (1 - s) * (1 - t);
  const w01 = (1 - s) * t;
  const w10 = s * (1 - t);
  const w11 = s * t;

  let sum = 0;
  let wSum = 0;
  if (v00 !== null) { sum += v00 * w00; wSum += w00; }
  if (v01 !== null) { sum += v01 * w01; wSum += w01; }
  if (v10 !== null) { sum += v10 * w10; wSum += w10; }
  if (v11 !== null) { sum += v11 * w11; wSum += w11; }

  return wSum > 0 ? sum / wSum : null;
}

/** Pure bilinear sample at a polar position. */
function sampleBilinear(
  azimuth_deg: number,
  g_lo: number, g_hi: number, g_t: number,
  momentArrays: ((number | null)[] | null)[],
  azIdx: AzimuthIndex,
  gateCounts: Uint16Array,
): number | null {
  const [ri1, ri2, az_t] = findBracketingRadials(azimuth_deg, azIdx);
  const v00 = getGateValue(momentArrays, ri1, g_lo, gateCounts);
  const v01 = getGateValue(momentArrays, ri1, g_hi, gateCounts);
  const v10 = getGateValue(momentArrays, ri2, g_lo, gateCounts);
  const v11 = getGateValue(momentArrays, ri2, g_hi, gateCounts);
  return interpolateWithNulls(v00, v01, v10, v11, az_t, g_t);
}

const ASPECT_THRESHOLD = 2.0;
const MAX_EXTRA_SAMPLES = 4;

/** Bilinear + adaptive azimuthal averaging for far-range smoothing. */
function sampleAdaptive(
  azimuth_deg: number,
  g_lo: number, g_hi: number, g_t: number,
  range_km: number,
  avgDeltaAz: number,
  gateSizeKm: number,
  momentArrays: ((number | null)[] | null)[],
  azIdx: AzimuthIndex,
  gateCounts: Uint16Array,
): number | null {
  const binWidthKm = range_km * avgDeltaAz * (Math.PI / 180);
  const aspect = binWidthKm / gateSizeKm;

  if (aspect <= ASPECT_THRESHOLD) {
    return sampleBilinear(azimuth_deg, g_lo, g_hi, g_t, momentArrays, azIdx, gateCounts);
  }

  const numExtra = Math.min(Math.ceil((aspect - ASPECT_THRESHOLD) / 2), MAX_EXTRA_SAMPLES);
  const sigma = avgDeltaAz / 3;
  const invTwoSigmaSq = 1 / (2 * sigma * sigma);

  let wSum = 0;
  let vSum = 0;

  // Central sample
  const cv = sampleBilinear(azimuth_deg, g_lo, g_hi, g_t, momentArrays, azIdx, gateCounts);
  if (cv !== null) { vSum += cv; wSum += 1.0; }

  // Extra azimuthal samples with Gaussian weighting
  const azStep = avgDeltaAz / (numExtra + 1);
  for (let i = 1; i <= numExtra; i++) {
    const offset = i * azStep;
    const w = Math.exp(-(offset * offset) * invTwoSigmaSq);

    let az = azimuth_deg + offset;
    if (az >= 360) az -= 360;
    const vp = sampleBilinear(az, g_lo, g_hi, g_t, momentArrays, azIdx, gateCounts);
    if (vp !== null) { vSum += vp * w; wSum += w; }

    az = azimuth_deg - offset;
    if (az < 0) az += 360;
    const vm = sampleBilinear(az, g_lo, g_hi, g_t, momentArrays, azIdx, gateCounts);
    if (vm !== null) { vSum += vm * w; wSum += w; }
  }

  return wSum > 0 ? vSum / wSum : null;
}

/**
 * Render polar radar data using bilinear interpolation in polar space.
 *
 * Reverse scan conversion: for each canvas pixel → polar coords →
 * bilinear interpolation of 4 nearest samples → color map → pixel write.
 *
 * @param mode 'low' = bilinear only, 'high' = bilinear + adaptive azimuthal averaging
 */
export function drawPolarDataInterpolated(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  radials: any[],
  azimuths: number[],
  colorTable: ColorStop[],
  centerX: number,
  centerY: number,
  maxRadius: number,
  totalRangeKm: number,
  mode: 'low' | 'high',
): void {
  if (!Array.isArray(radials) || radials.length === 0) return;

  const canvasSize = Math.round(centerX * 2);
  const pxPerKm = maxRadius / totalRangeKm;
  const kmPerPx = totalRangeKm / maxRadius;
  const maxRadiusSq = maxRadius * maxRadius;
  const RAD2DEG = 180 / Math.PI;

  // Build sorted azimuth index
  const azIdx = buildAzimuthIndex(azimuths);

  // Extract metadata from a representative radial
  const r0 = radials.find((r: any) => r != null);
  if (!r0) return;
  const firstGateKm = r0.first_gate;
  const gateSizeKm = r0.gate_size;
  const invGateSize = 1 / gateSizeKm;
  const firstGatePxSq = (firstGateKm * pxPerKm) ** 2;

  // Pre-extract moment_data arrays for fast access
  const momentArrays: ((number | null)[] | null)[] = new Array(radials.length);
  const gateCounts = new Uint16Array(radials.length);
  for (let i = 0; i < radials.length; i++) {
    momentArrays[i] = radials[i]?.moment_data ?? null;
    gateCounts[i] = radials[i]?.gate_count ?? 0;
  }

  // For high mode
  const avgDeltaAz = 360 / azIdx.count;

  // Allocate ImageData
  const imageData = ctx.createImageData(canvasSize, canvasSize);
  const pixels = imageData.data;

  for (let y = 0; y < canvasSize; y++) {
    const dy = centerY - y;
    const dySq = dy * dy;
    const rowOffset = y * canvasSize * 4;

    for (let x = 0; x < canvasSize; x++) {
      const dx = x - centerX;
      const distSq = dx * dx + dySq;

      // Skip outside radar circle and inside first gate
      if (distSq > maxRadiusSq || distSq < firstGatePxSq) continue;

      const range_km = Math.sqrt(distSq) * kmPerPx;
      const g_f = (range_km - firstGateKm) * invGateSize;
      const g_lo = g_f | 0; // fast floor for positive values
      const g_hi = g_lo + 1;
      const g_t = g_f - g_lo;

      // Azimuth: CW from north
      let az = 90 - Math.atan2(dy, dx) * RAD2DEG;
      if (az < 0) az += 360;
      else if (az >= 360) az -= 360;

      let val: number | null;
      if (mode === 'high') {
        val = sampleAdaptive(az, g_lo, g_hi, g_t, range_km, avgDeltaAz, gateSizeKm, momentArrays, azIdx, gateCounts);
      } else {
        val = sampleBilinear(az, g_lo, g_hi, g_t, momentArrays, azIdx, gateCounts);
      }

      if (val === null) continue;

      const rgba = valueToRGBA(val, colorTable);
      if (!rgba) continue;

      const off = rowOffset + x * 4;
      pixels[off]     = rgba[0] + 0.5 | 0; // fast round for positive values
      pixels[off + 1] = rgba[1] + 0.5 | 0;
      pixels[off + 2] = rgba[2] + 0.5 | 0;
      pixels[off + 3] = (rgba[3] * 255 + 0.5) | 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ── SAILS elevation detection ──

export interface SailsDetectionResult {
  /** Number of sweeps at the lowest elevation angle (1 = no SAILS, 2+ = SAILS) */
  sweepCount: number;
  /** Elevation numbers (1-based) for each sweep at the lowest angle, in VCP order */
  elevationNumbers: number[];
  /** The shared elevation angle (degrees) */
  elevationAngle: number;
}

/**
 * Detect SAILS/MESO-SAILS supplemental sweeps in a parsed volume.
 *
 * The nexrad-level-2-data library groups radials by `elevation_number` into
 * `radar.data[elevationNumber]`. SAILS supplemental sweeps at 0.5° get
 * DIFFERENT elevation numbers than the first 0.5° sweep (they occupy
 * separate VCP cut positions). So `radar.data[1]` has only the first 0.5°
 * sweep, and supplementals live at higher elevation numbers (e.g., 4, 7).
 *
 * Detection: find all elevation numbers that share the same (lowest)
 * elevation angle. Multiple entries = SAILS.
 *
 * @param radar - Parsed Level2Radar instance
 * @returns Detection result with sweep count and elevation number mapping
 */
export function detectSailsElevations(radar: any): SailsDetectionResult {
  try {
    const elevIndices: number[] = radar.listElevations?.() ?? [];
    if (elevIndices.length === 0) {
      return { sweepCount: 1, elevationNumbers: [1], elevationAngle: 0.5 };
    }

    // Get the elevation angle for each elevation number
    const elevAngles: Map<number, number> = new Map();
    for (const idx of elevIndices) {
      const records = radar.data?.[idx];
      if (Array.isArray(records) && records.length > 0) {
        const angle = records[0]?.record?.elevation_angle;
        if (typeof angle === 'number') {
          // Round to 1 decimal to group by angle
          elevAngles.set(idx, Math.round(angle * 10) / 10);
        }
      }
    }

    // Group elevation numbers by their angle
    const angleGroups: Map<number, number[]> = new Map();
    for (const [idx, angle] of elevAngles) {
      if (!angleGroups.has(angle)) angleGroups.set(angle, []);
      angleGroups.get(angle)!.push(idx);
    }

    // Find the lowest angle — this is where SAILS sweeps occur
    let lowestAngle = Infinity;
    for (const angle of angleGroups.keys()) {
      if (angle < lowestAngle) lowestAngle = angle;
    }

    const lowestGroup = angleGroups.get(lowestAngle);
    if (!lowestGroup || lowestGroup.length === 0) {
      return { sweepCount: 1, elevationNumbers: [1], elevationAngle: 0.5 };
    }

    // Sort elevation numbers to maintain VCP order
    lowestGroup.sort((a, b) => a - b);

    if (lowestGroup.length > 1) {
      console.log(`[SAILS] Detected ${lowestGroup.length} sweeps at ${lowestAngle}° → elevation numbers: [${lowestGroup.join(', ')}]`);
    }

    return {
      sweepCount: lowestGroup.length,
      elevationNumbers: lowestGroup,
      elevationAngle: lowestAngle,
    };
  } catch (err) {
    console.warn('[renderLogic] detectSailsElevations error:', err);
    return { sweepCount: 1, elevationNumbers: [1], elevationAngle: 0.5 };
  }
}

/**
 * Extract a millisecond timestamp from a radial record.
 * Uses julian_date + mseconds fields from the Message Type 31 header.
 */
function extractRadialTimestamp(record: any): number {
  if (!record) return 0;
  const julianDate = record.julian_date ?? record.date ?? 0;
  const msOfDay = record.mseconds ?? record.time ?? 0;
  if (julianDate === 0 && msOfDay === 0) return 0;
  return (julianDate - 1) * 86400000 + msOfDay;
}

/**
 * Get the color table for a product.
 */
export function getColorTable(product: 'REF' | 'VEL'): ColorStop[] {
  return product === 'REF' ? REF_COLOR_TABLE : VEL_COLOR_TABLE;
}

/**
 * Get the moment data array for a product from a Level2Radar instance.
 * Returns null if not available or all radials are empty.
 */
export function getMomentData(radar: any, product: 'REF' | 'VEL'): any[] | null {
  let data: any[] | null = null;
  if (product === 'REF') {
    data = radar.getHighresReflectivity?.() ?? null;
  } else if (product === 'VEL') {
    data = radar.getHighresVelocity?.() ?? null;
  }
  if (!data || !Array.isArray(data)) return null;
  if (data.every((r: any) => r == null)) return null;
  return data;
}

/**
 * Extract the true antenna lat/lon from a Level2Radar instance's volume header.
 * Falls back to the provided coordinates if extraction fails.
 */
export function extractTrueCoords(
  radar: any,
  fallbackLat: number,
  fallbackLon: number,
): { lat: number; lon: number } {
  try {
    const records = radar.getHeader();
    if (Array.isArray(records) && records.length > 0) {
      const vol = records[0]?.volume;
      if (vol && typeof vol.latitude === 'number' && typeof vol.longitude === 'number'
          && vol.latitude !== 0 && vol.longitude !== 0) {
        return { lat: vol.latitude, lon: vol.longitude };
      }
    }
  } catch {
    // Fall back to passed-in coordinates
  }
  return { lat: fallbackLat, lon: fallbackLon };
}

/**
 * Extract timestamp from a Level2Radar header.
 */
export function extractTimestamp(radar: any): number {
  const header = radar.header ?? {};
  const julianDays = typeof header.date === 'number' ? header.date : parseInt(header.date ?? '0', 10);
  const msOfDay = typeof header.time === 'number' ? header.time : parseInt(header.time ?? '0', 10);
  return (julianDays - 1) * 86400000 + msOfDay;
}

/**
 * Parsed radar data that can be cached and reused across product switches.
 * Contains everything needed to render any product without re-parsing.
 */
export interface ParsedRadarData {
  radar: any;
  siteId: string;
  vcp: number;
  /** Unique elevation angles (degrees), deduplicated and in VCP order */
  elevations: number[];
  /** Corresponding 1-based elevation numbers for each entry in `elevations` */
  elevationNumbers: number[];
  trueCoords: { lat: number; lon: number };
  timestamp: number;
}

/**
 * Parse a raw scan buffer into a reusable radar object + metadata.
 * This is the expensive part (~300-500ms): gunzip + Level2Radar parse.
 */
export function parseRadarBuffer(
  scanBuffer: ArrayBuffer,
  siteLat: number,
  siteLon: number,
  deps: {
    gunzip: (data: Uint8Array) => Uint8Array;
    createRadar: (buf: any) => any;
    wrapBuffer: (data: Uint8Array) => any;
  },
): ParsedRadarData | null {
  try {
    const bytes = new Uint8Array(scanBuffer);
    let data: Uint8Array;
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      data = deps.gunzip(bytes);
    } else {
      data = bytes;
    }

    const buf = deps.wrapBuffer(data);
    const radar = deps.createRadar(buf);

    const header = radar.header ?? {};
    const siteId = header.icao ?? header.ICAO ?? '';
    const vcp = radar.vcp ?? 0;
    const elevationIndices = radar.listElevations?.() ?? [];
    const radarData = radar.data;

    // Build deduplicated elevation list: SAILS supplemental sweeps share
    // the same angle as the first 0.5° sweep but have different elevation
    // numbers. Keep only the first occurrence of each angle.
    const elevations: number[] = [];
    const elevationNumbers: number[] = [];
    const seenAngles = new Set<number>();

    for (const idx of elevationIndices) {
      const elevData = radarData?.[idx];
      const angle = elevData?.[0]?.record?.elevation_angle;
      const rounded = typeof angle === 'number' ? Math.round(angle * 10) / 10 : idx;

      if (!seenAngles.has(rounded)) {
        seenAngles.add(rounded);
        elevations.push(rounded);
        elevationNumbers.push(idx);
      }
    }

    // Sort by ascending angle so the dropdown reads low → high
    const sortOrder = elevations.map((angle, i) => ({ angle, elevNum: elevationNumbers[i] }));
    sortOrder.sort((a, b) => a.angle - b.angle);
    const sortedElevations = sortOrder.map((e) => e.angle);
    const sortedElevationNumbers = sortOrder.map((e) => e.elevNum);

    const trueCoords = extractTrueCoords(radar, siteLat, siteLon);
    const timestamp = extractTimestamp(radar);

    return { radar, siteId, vcp, elevations: sortedElevations, elevationNumbers: sortedElevationNumbers, trueCoords, timestamp };
  } catch (err) {
    console.error('[renderLogic] parseRadarBuffer error:', err);
    return null;
  }
}

/**
 * Render a product from a pre-parsed radar object.
 * This is the fast part (~100-200ms): just canvas rendering.
 * Used on product switch when the radar object is already cached.
 */
export function renderFromParsed(
  parsed: ParsedRadarData,
  product: 'REF' | 'VEL',
  elevationNumber: number,
  canvasSize: number,
  deps: {
    createCanvas: (w: number, h: number) => {
      ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      canvas: HTMLCanvasElement | OffscreenCanvas;
    };
  },
  customColorTable?: ColorStop[],
  smoothing?: SmoothingMode,
  sweepIndex?: number,
): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  timestamp: number;
  product: string;
  elevation: number;
  siteLat: number;
  siteLon: number;
  rangeKm: number;
  elevations: number[];
  elevationNumbers: number[];
  vcp: number;
  siteId: string;
  /** Actual timestamp from sweep radials (differs from volume header when SAILS) */
  sweepTimestamp?: number;
  /** Number of sweeps detected at this elevation */
  sweepCount?: number;
} | null {
  try {
    const { radar, siteId, vcp, elevations, elevationNumbers, trueCoords, timestamp } = parsed;

    // Determine which elevation number to render.
    // When sweepIndex is set, SAILS supplemental sweeps live at different
    // elevation numbers (same angle, different VCP cut positions).
    let actualElevNumber = elevationNumber;
    let sweepTimestamp: number | undefined;
    let sweepCount: number | undefined;

    if (sweepIndex !== undefined) {
      const sails = detectSailsElevations(radar);
      sweepCount = sails.sweepCount;

      if (sails.sweepCount > 1 && sweepIndex < sails.elevationNumbers.length) {
        // Only override elevation when the user is viewing the SAILS elevation
        // (the lowest angle where supplemental sweeps occur). At higher elevations,
        // keep the requested elevation — sub-frames render identically there.
        const isSailsElevation = sails.elevationNumbers.includes(elevationNumber);
        if (isSailsElevation) {
          actualElevNumber = sails.elevationNumbers[sweepIndex];

          // Extract actual timestamp from first radial of this sweep
          const records = radar.data?.[actualElevNumber];
          if (Array.isArray(records) && records.length > 0) {
            const rec = records[0]?.record;
            if (rec) {
              sweepTimestamp = extractRadialTimestamp(rec);
            }
          }
        }
      }
      // If sweepIndex >= sails.sweepCount, fall back to default elevation (graceful VCP-change handling)
    }

    radar.setElevation(actualElevNumber);
    let momentData = getMomentData(radar, product);
    if (!momentData && actualElevNumber < 17) {
      radar.setElevation(actualElevNumber + 1);
      momentData = getMomentData(radar, product);
    }
    if (!momentData) return null;

    const colorTable = customColorTable ?? getColorTable(product);
    const azimuths = radar.getAzimuth();
    if (!azimuths || azimuths.length === 0) return null;

    const r0 = momentData.find((r: any) => r != null);
    const rangeKm = r0
      ? r0.first_gate + r0.gate_count * r0.gate_size
      : (product === 'REF' ? 460 : 300);

    const { ctx, canvas } = deps.createCanvas(canvasSize, canvasSize);
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    const center = canvasSize / 2;

    if (smoothing === 'low' || smoothing === 'high') {
      drawPolarDataInterpolated(ctx, momentData, azimuths, colorTable, center, center, center, rangeKm, smoothing);
    } else {
      drawPolarData(ctx, momentData, azimuths, colorTable, center, center, center, rangeKm);
    }

    return {
      canvas,
      timestamp,
      product,
      elevation: elevationNumber,
      siteLat: trueCoords.lat,
      siteLon: trueCoords.lon,
      rangeKm,
      elevations,
      elevationNumbers,
      vcp,
      siteId,
      sweepTimestamp,
      sweepCount,
    };
  } catch (err) {
    console.error('[renderLogic] renderFromParsed error:', err);
    return null;
  }
}

/**
 * Full decode + render pipeline. Works in both main thread and worker.
 * Requires: pako, Buffer, Level2Radar available in scope.
 *
 * @param scanBuffer - Raw (possibly gzipped) NEXRAD Level 2 ArrayBuffer
 * @param product - 'REF' or 'VEL'
 * @param elevationNumber - 1-based elevation number
 * @param siteLat - Fallback site latitude
 * @param siteLon - Fallback site longitude
 * @param canvasSize - Canvas dimensions (default 3600)
 * @param createCanvas - Factory: returns a 2D canvas context + the canvas/offscreen
 */
export function decodeAndRender(
  scanBuffer: ArrayBuffer,
  product: 'REF' | 'VEL',
  elevationNumber: number,
  siteLat: number,
  siteLon: number,
  canvasSize: number,
  deps: {
    gunzip: (data: Uint8Array) => Uint8Array;
    createRadar: (buf: any) => any;
    wrapBuffer: (data: Uint8Array) => any;
    createCanvas: (w: number, h: number) => {
      ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      canvas: HTMLCanvasElement | OffscreenCanvas;
    };
  },
  customColorTable?: ColorStop[],
  smoothing?: SmoothingMode,
): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  timestamp: number;
  product: string;
  elevation: number;
  siteLat: number;
  siteLon: number;
  rangeKm: number;
  elevations: number[];
  vcp: number;
  siteId: string;
} | null {
  try {
    // 1. Decompress if gzipped
    const bytes = new Uint8Array(scanBuffer);
    let data: Uint8Array;
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      data = deps.gunzip(bytes);
    } else {
      data = bytes;
    }

    // 2. Parse with Level2Radar
    const buf = deps.wrapBuffer(data);
    const radar = deps.createRadar(buf);

    // 3. Extract metadata
    const header = radar.header ?? {};
    const siteId = header.icao ?? header.ICAO ?? '';
    const vcp = radar.vcp ?? 0;
    const elevationIndices = radar.listElevations?.() ?? [];
    const radarData = radar.data;
    const elevations = elevationIndices.map((idx: number) => {
      const elevData = radarData?.[idx];
      const angle = elevData?.[0]?.record?.elevation_angle;
      return typeof angle === 'number' ? Math.round(angle * 10) / 10 : idx;
    });

    // 4. Get moment data at requested elevation (try next elevation for split-cut VCPs)
    radar.setElevation(elevationNumber);
    let momentData = getMomentData(radar, product);
    if (!momentData && elevationNumber < 17) {
      radar.setElevation(elevationNumber + 1);
      momentData = getMomentData(radar, product);
    }
    if (!momentData) return null;

    // 5. Compute range
    const colorTable = customColorTable ?? getColorTable(product);
    const r0 = momentData.find((r: any) => r != null);
    const rangeKm = r0
      ? r0.first_gate + r0.gate_count * r0.gate_size
      : (product === 'REF' ? 460 : 300);

    // 6. Extract true coordinates
    const trueCoords = extractTrueCoords(radar, siteLat, siteLon);

    // 7. Get azimuths
    const azimuths = radar.getAzimuth();
    if (!azimuths || azimuths.length === 0) return null;

    // 8. Create canvas and render
    const { ctx, canvas } = deps.createCanvas(canvasSize, canvasSize);
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    const center = canvasSize / 2;

    if (smoothing === 'low' || smoothing === 'high') {
      drawPolarDataInterpolated(ctx, momentData, azimuths, colorTable, center, center, center, rangeKm, smoothing);
    } else {
      drawPolarData(ctx, momentData, azimuths, colorTable, center, center, center, rangeKm);
    }

    // 9. Extract timestamp
    const timestamp = extractTimestamp(radar);

    return {
      canvas,
      timestamp,
      product,
      elevation: elevationNumber,
      siteLat: trueCoords.lat,
      siteLon: trueCoords.lon,
      rangeKm,
      elevations,
      vcp,
      siteId,
    };
  } catch (err) {
    console.error('[renderLogic] decodeAndRender error:', err);
    return null;
  }
}
