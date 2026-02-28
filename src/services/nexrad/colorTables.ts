/**
 * NWS-standard color tables for NEXRAD radar products.
 * Each stop defines: value threshold, RGBA color.
 * Colors are applied to values >= the stop's value and < the next stop's value.
 */

export interface ColorStop {
  value: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Reflectivity (dBZ) color table - NWS standard.
 * Range: -30 to 75+ dBZ
 */
export const REF_COLOR_TABLE: ColorStop[] = [
  // Light returns
  { value: -30, r: 0, g: 0, b: 0, a: 0 },
  { value: 5, r: 40, g: 40, b: 40, a: 0.6 },
  // Greens (light to moderate rain)
  { value: 10, r: 0, g: 100, b: 0, a: 0.85 },
  { value: 15, r: 0, g: 140, b: 0, a: 0.85 },
  { value: 20, r: 0, g: 180, b: 0, a: 0.85 },
  { value: 25, r: 0, g: 220, b: 0, a: 0.85 },
  { value: 30, r: 0, g: 255, b: 0, a: 0.85 },
  // Yellows (moderate to heavy rain)
  { value: 35, r: 255, g: 255, b: 0, a: 0.85 },
  { value: 40, r: 230, g: 190, b: 0, a: 0.85 },
  // Oranges/Reds (heavy rain, possible hail)
  { value: 45, r: 255, g: 144, b: 0, a: 0.85 },
  { value: 50, r: 255, g: 0, b: 0, a: 0.85 },
  { value: 55, r: 200, g: 0, b: 0, a: 0.85 },
  // Magentas/Purples (extreme, large hail)
  { value: 60, r: 180, g: 0, b: 180, a: 0.85 },
  { value: 65, r: 255, g: 0, b: 255, a: 0.85 },
  // Whites (extremely intense)
  { value: 70, r: 255, g: 200, b: 200, a: 0.85 },
  { value: 75, r: 255, g: 255, b: 255, a: 0.85 },
];

/**
 * Velocity (m/s) color table - NWS standard.
 * Negative = inbound (toward radar, greens)
 * Positive = outbound (away from radar, reds)
 * Range: roughly -64 to +64 m/s
 */
export const VEL_COLOR_TABLE: ColorStop[] = [
  // Strong inbound (greens, bright to dark)
  { value: -64, r: 0, g: 255, b: 0, a: 0.85 },
  { value: -50, r: 0, g: 220, b: 0, a: 0.85 },
  { value: -40, r: 0, g: 190, b: 0, a: 0.85 },
  { value: -30, r: 0, g: 160, b: 0, a: 0.85 },
  { value: -20, r: 0, g: 130, b: 0, a: 0.85 },
  { value: -15, r: 0, g: 110, b: 0, a: 0.85 },
  { value: -10, r: 0, g: 90, b: 0, a: 0.85 },
  { value: -5, r: 0, g: 70, b: 0, a: 0.85 },
  // Near zero (gray)
  { value: -1, r: 80, g: 80, b: 80, a: 0.5 },
  { value: 1, r: 80, g: 80, b: 80, a: 0.5 },
  // Outbound (reds, dark to bright)
  { value: 5, r: 70, g: 0, b: 0, a: 0.85 },
  { value: 10, r: 90, g: 0, b: 0, a: 0.85 },
  { value: 15, r: 110, g: 0, b: 0, a: 0.85 },
  { value: 20, r: 130, g: 0, b: 0, a: 0.85 },
  { value: 30, r: 160, g: 0, b: 0, a: 0.85 },
  { value: 40, r: 190, g: 0, b: 0, a: 0.85 },
  { value: 50, r: 220, g: 0, b: 0, a: 0.85 },
  { value: 64, r: 255, g: 0, b: 0, a: 0.85 },
];

// ── Built-in alternative palettes ────────────────────────────────────

/**
 * RadarScope-style reflectivity palette.
 * Darker low-end, sharper contrast at high dBZ, distinctive purple/white hail tones.
 */
export const REF_SCOPE_TABLE: ColorStop[] = [
  { value: -30, r: 0, g: 0, b: 0, a: 0 },
  { value: 5, r: 29, g: 37, b: 60, a: 0.7 },
  { value: 10, r: 50, g: 80, b: 120, a: 0.8 },
  { value: 15, r: 89, g: 155, b: 171, a: 0.85 },
  { value: 20, r: 33, g: 186, b: 72, a: 0.85 },
  { value: 25, r: 20, g: 150, b: 40, a: 0.85 },
  { value: 30, r: 5, g: 120, b: 5, a: 0.85 },
  { value: 35, r: 5, g: 101, b: 1, a: 0.85 },
  { value: 40, r: 251, g: 252, b: 0, a: 0.85 },
  { value: 45, r: 199, g: 176, b: 0, a: 0.85 },
  { value: 50, r: 253, g: 149, b: 2, a: 0.85 },
  { value: 55, r: 253, g: 38, b: 0, a: 0.85 },
  { value: 60, r: 172, g: 92, b: 2, a: 0.85 },
  { value: 65, r: 193, g: 148, b: 179, a: 0.85 },
  { value: 70, r: 200, g: 23, b: 119, a: 0.85 },
  { value: 75, r: 165, g: 2, b: 215, a: 0.85 },
  { value: 80, r: 135, g: 255, b: 253, a: 0.85 },
];

/**
 * Classic NWS 16-level reflectivity palette.
 * The traditional blocky NWS look with distinct color bands.
 */
export const REF_CLASSIC_TABLE: ColorStop[] = [
  { value: -30, r: 0, g: 0, b: 0, a: 0 },
  { value: 5, r: 4, g: 233, b: 231, a: 0.7 },
  { value: 10, r: 1, g: 159, b: 244, a: 0.85 },
  { value: 15, r: 3, g: 0, b: 244, a: 0.85 },
  { value: 20, r: 2, g: 253, b: 2, a: 0.85 },
  { value: 25, r: 1, g: 197, b: 1, a: 0.85 },
  { value: 30, r: 0, g: 142, b: 0, a: 0.85 },
  { value: 35, r: 253, g: 248, b: 2, a: 0.85 },
  { value: 40, r: 229, g: 188, b: 0, a: 0.85 },
  { value: 45, r: 253, g: 149, b: 0, a: 0.85 },
  { value: 50, r: 253, g: 0, b: 0, a: 0.85 },
  { value: 55, r: 212, g: 0, b: 0, a: 0.85 },
  { value: 60, r: 188, g: 0, b: 0, a: 0.85 },
  { value: 65, r: 248, g: 0, b: 253, a: 0.85 },
  { value: 70, r: 152, g: 84, b: 198, a: 0.85 },
  { value: 75, r: 255, g: 255, b: 255, a: 0.85 },
];

/**
 * RadarScope-style velocity palette.
 * Brighter greens/reds with a narrow gray zero band.
 */
export const VEL_SCOPE_TABLE: ColorStop[] = [
  { value: -64, r: 0, g: 255, b: 100, a: 0.85 },
  { value: -50, r: 0, g: 230, b: 60, a: 0.85 },
  { value: -40, r: 0, g: 200, b: 30, a: 0.85 },
  { value: -30, r: 0, g: 170, b: 10, a: 0.85 },
  { value: -20, r: 0, g: 140, b: 0, a: 0.85 },
  { value: -15, r: 0, g: 120, b: 0, a: 0.85 },
  { value: -10, r: 0, g: 100, b: 0, a: 0.85 },
  { value: -5, r: 0, g: 80, b: 0, a: 0.85 },
  { value: -2, r: 60, g: 60, b: 60, a: 0.5 },
  { value: 2, r: 60, g: 60, b: 60, a: 0.5 },
  { value: 5, r: 80, g: 0, b: 0, a: 0.85 },
  { value: 10, r: 100, g: 0, b: 0, a: 0.85 },
  { value: 15, r: 120, g: 0, b: 0, a: 0.85 },
  { value: 20, r: 140, g: 0, b: 0, a: 0.85 },
  { value: 30, r: 170, g: 10, b: 0, a: 0.85 },
  { value: 40, r: 200, g: 30, b: 0, a: 0.85 },
  { value: 50, r: 230, g: 60, b: 0, a: 0.85 },
  { value: 64, r: 255, g: 100, b: 0, a: 0.85 },
];

// ── Built-in palette registry ────────────────────────────────────────

/**
 * Registry of all built-in palettes, keyed by product then name.
 */
export const BUILTIN_PALETTES: Record<string, Record<string, ColorStop[]>> = {
  REF: {
    'NWS Default': REF_COLOR_TABLE,
    'Scope': REF_SCOPE_TABLE,
    'Classic': REF_CLASSIC_TABLE,
  },
  VEL: {
    'NWS Default': VEL_COLOR_TABLE,
    'Scope': VEL_SCOPE_TABLE,
  },
};

/**
 * Get the names of all built-in palettes for a product.
 */
export function getBuiltinPaletteNames(product: string): string[] {
  return Object.keys(BUILTIN_PALETTES[product] ?? {});
}
