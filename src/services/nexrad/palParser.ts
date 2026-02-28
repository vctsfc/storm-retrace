/**
 * Parser for GRLevelX / RadarScope .pal color table files.
 *
 * The .pal format is the industry standard for weather radar color palettes,
 * used by RadarScope, GR2Analyst, RadarOmega, and community sites like wxtools.org.
 *
 * Supports:
 *   - Color: value R G B           (gradient, interpolated to next stop)
 *   - Color4: value R G B A        (gradient with alpha)
 *   - SolidColor: value R G B      (flat band, no interpolation)
 *   - SolidColor4: value R G B A   (flat band with alpha)
 *   - Headers: product, Units, Step, Scale
 *
 * Gradient stops are pre-expanded at parse time into discrete 1-unit intervals
 * with integer-rounded RGB values. This preserves the gate batching optimization
 * in the radar renderer (adjacent same-color gates merged into single arcs).
 */

import type { ColorStop } from './colorTables';

// ── Types ────────────────────────────────────────────────────────────

export interface PalParseResult {
  /** Auto-detected product from `product:` header, or null */
  product: 'REF' | 'VEL' | null;
  /** Units string from header (e.g. "DBZ", "KTS") */
  units: string | null;
  /** Pre-expanded color stops, sorted by value */
  stops: ColorStop[];
}

interface RawPalStop {
  value: number;
  r: number;
  g: number;
  b: number;
  a: number; // 0-1 float
  solid: boolean; // true = SolidColor (flat band), false = Color (gradient)
}

// ── Product code mapping ─────────────────────────────────────────────

const PRODUCT_MAP: Record<string, 'REF' | 'VEL'> = {
  BR: 'REF',
  N0Q: 'REF',
  N0R: 'REF',
  N0Z: 'REF',
  DR: 'REF',
  BV: 'VEL',
  N0U: 'VEL',
  N0V: 'VEL',
  SRV: 'VEL',
};

// Default alpha when not specified (matches existing NWS tables)
const DEFAULT_ALPHA = 0.85;

// ── Main parser ──────────────────────────────────────────────────────

/**
 * Parse a .pal file text into pre-expanded ColorStop[].
 *
 * The returned stops are ready to use directly in the radar renderer.
 * Gradient entries are expanded at 1-unit intervals with rounded RGB values,
 * which preserves the gate batching optimization.
 */
export function parsePalFile(text: string): PalParseResult {
  const lines = text.split(/\r?\n/);
  let product: 'REF' | 'VEL' | null = null;
  let units: string | null = null;
  const rawStops: RawPalStop[] = [];

  for (const rawLine of lines) {
    // Strip comments (everything after semicolon)
    const commentIdx = rawLine.indexOf(';');
    const line = (commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine).trim();
    if (!line) continue;

    // Parse headers (case-insensitive)
    const lowerLine = line.toLowerCase();

    if (lowerLine.startsWith('product:')) {
      const code = line.slice(8).trim().toUpperCase();
      product = PRODUCT_MAP[code] ?? null;
      continue;
    }

    if (lowerLine.startsWith('units:')) {
      units = line.slice(6).trim();
      continue;
    }

    // Skip other headers we don't need
    if (lowerLine.startsWith('step:') || lowerLine.startsWith('scale:') || lowerLine.startsWith('offset:') || lowerLine.startsWith('rf:') || lowerLine.startsWith('nd:')) {
      continue;
    }

    // Parse color entries
    const stop = parseColorLine(line);
    if (stop) {
      rawStops.push(stop);
    }
  }

  // Sort by value ascending
  rawStops.sort((a, b) => a.value - b.value);

  // Expand gradients into discrete steps
  const stops = expandGradientStops(rawStops);

  return { product, units, stops };
}

// ── Color line parser ────────────────────────────────────────────────

function parseColorLine(line: string): RawPalStop | null {
  const lower = line.toLowerCase();

  // Determine type and extract the rest of the line
  let solid = false;
  let hasAlpha = false;
  let rest: string;

  if (lower.startsWith('solidcolor4:')) {
    solid = true;
    hasAlpha = true;
    rest = line.slice(12).trim();
  } else if (lower.startsWith('solidcolor:')) {
    solid = true;
    hasAlpha = false;
    rest = line.slice(11).trim();
  } else if (lower.startsWith('color4:')) {
    solid = false;
    hasAlpha = true;
    rest = line.slice(7).trim();
  } else if (lower.startsWith('color:')) {
    solid = false;
    hasAlpha = false;
    rest = line.slice(6).trim();
  } else {
    return null; // Not a color line
  }

  // Split remaining tokens by whitespace
  const tokens = rest.split(/\s+/).map(Number);

  // Minimum: value R G B (4 tokens)
  if (tokens.length < 4 || tokens.some((t) => !Number.isFinite(t))) {
    return null;
  }

  const value = tokens[0];
  const r = clamp(Math.round(tokens[1]), 0, 255);
  const g = clamp(Math.round(tokens[2]), 0, 255);
  const b = clamp(Math.round(tokens[3]), 0, 255);

  let a = DEFAULT_ALPHA;
  if (hasAlpha && tokens.length >= 5) {
    // .pal alpha is 0-255, our ColorStop.a is 0-1
    a = clamp(tokens[4], 0, 255) / 255;
  }

  return { value, r, g, b, a, solid };
}

// ── Gradient expansion ───────────────────────────────────────────────

/**
 * Expand gradient `Color:` entries into discrete 1-unit steps.
 *
 * SolidColor entries produce a single ColorStop at their value.
 * Color (gradient) entries are interpolated at integer intervals from
 * their value to the next stop's value, with RGB rounded to integers.
 *
 * Rounding is critical: it ensures adjacent gates at e.g. 35.1 and 35.2 dBZ
 * produce identical `rgba()` strings, preserving the gate batching optimization
 * in drawPolarData().
 *
 * @param stepSize - Expansion interval. Default 1 (1 dBZ or 1 m/s).
 */
export function expandGradientStops(rawStops: RawPalStop[], stepSize = 1): ColorStop[] {
  if (rawStops.length === 0) return [];
  if (rawStops.length === 1) {
    const s = rawStops[0];
    return [{ value: s.value, r: s.r, g: s.g, b: s.b, a: roundAlpha(s.a) }];
  }

  const result: ColorStop[] = [];

  for (let i = 0; i < rawStops.length - 1; i++) {
    const curr = rawStops[i];
    const next = rawStops[i + 1];

    if (curr.solid) {
      // Solid band: single stop, no interpolation
      result.push({
        value: curr.value,
        r: curr.r,
        g: curr.g,
        b: curr.b,
        a: roundAlpha(curr.a),
      });
    } else {
      // Gradient: interpolate at stepSize intervals from curr.value to next.value
      const range = next.value - curr.value;
      if (range <= 0) {
        // Degenerate: same value, just emit the stop
        result.push({
          value: curr.value,
          r: curr.r,
          g: curr.g,
          b: curr.b,
          a: roundAlpha(curr.a),
        });
        continue;
      }

      // Generate interpolated stops at each step
      for (let v = curr.value; v < next.value; v += stepSize) {
        const t = (v - curr.value) / range; // 0..1 interpolation parameter
        result.push({
          value: v,
          r: clamp(Math.round(lerp(curr.r, next.r, t)), 0, 255),
          g: clamp(Math.round(lerp(curr.g, next.g, t)), 0, 255),
          b: clamp(Math.round(lerp(curr.b, next.b, t)), 0, 255),
          a: roundAlpha(lerp(curr.a, next.a, t)),
        });
      }
    }
  }

  // Emit the final stop
  const last = rawStops[rawStops.length - 1];
  result.push({
    value: last.value,
    r: last.r,
    g: last.g,
    b: last.b,
    a: roundAlpha(last.a),
  });

  return result;
}

// ── Utility ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Round alpha to 2 decimal places for consistent rgba() string output */
function roundAlpha(a: number): number {
  return Math.round(a * 100) / 100;
}
