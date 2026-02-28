/**
 * Wind barb icon generator for MapLibre.
 *
 * Generates meteorological wind barb symbols as canvas → data URL images.
 * Each icon represents a wind speed bracket (0, 5, 10, 15, ..., 100 kt).
 * Wind direction is handled by MapLibre's `icon-rotate` property.
 *
 * WMO standard:
 * - Calm (0-2 kt): small circle, no staff
 * - Half barb (short line): 5 kt
 * - Full barb (long line): 10 kt
 * - Pennant/flag (filled triangle): 50 kt
 *
 * All barbs are drawn pointing UPWARD (north) on a 48×48 canvas.
 * MapLibre rotates them by wind direction (direction wind is FROM).
 */

import type maplibregl from 'maplibre-gl';

const ICON_SIZE = 48;
const CENTER_X = ICON_SIZE / 2;
const CENTER_Y = ICON_SIZE / 2;
const STAFF_LENGTH = 20;
const BARB_LENGTH = 10;
const HALF_BARB_LENGTH = 6;
const PENNANT_WIDTH = 4;
const BARB_SPACING = 4;
const STROKE_WIDTH = 2;
const STROKE_COLOR = '#ffffff';

/** Generate a wind barb icon ID for a given speed bracket. */
export function getWindBarbIconId(speedKt: number): string {
  const bracket = Math.round(speedKt / 5) * 5;
  const clamped = Math.max(0, Math.min(bracket, 100));
  return `wind-barb-${clamped}`;
}

/**
 * Draw a single wind barb on a canvas context.
 * Wind barb points upward (north). Barbs extend to the right of the staff.
 */
function drawWindBarb(ctx: CanvasRenderingContext2D, speedKt: number): void {
  ctx.strokeStyle = STROKE_COLOR;
  ctx.fillStyle = STROKE_COLOR;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Calm: just a circle
  if (speedKt < 3) {
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 4, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  // Draw the staff (vertical line from center going up)
  const staffTop = CENTER_Y - STAFF_LENGTH;
  const staffBottom = CENTER_Y + 2; // Slight extension below center for station dot area

  ctx.beginPath();
  ctx.moveTo(CENTER_X, staffBottom);
  ctx.lineTo(CENTER_X, staffTop);
  ctx.stroke();

  // Decompose speed into pennants, full barbs, and half barbs
  let remaining = Math.round(speedKt / 5) * 5; // Round to nearest 5
  const pennants = Math.floor(remaining / 50);
  remaining -= pennants * 50;
  const fullBarbs = Math.floor(remaining / 10);
  remaining -= fullBarbs * 10;
  const halfBarbs = Math.floor(remaining / 5);

  // Draw from the top of the staff downward
  let y = staffTop;

  // Draw pennants (filled triangles)
  for (let i = 0; i < pennants; i++) {
    ctx.beginPath();
    ctx.moveTo(CENTER_X, y);
    ctx.lineTo(CENTER_X + BARB_LENGTH, y + PENNANT_WIDTH / 2);
    ctx.lineTo(CENTER_X, y + PENNANT_WIDTH);
    ctx.closePath();
    ctx.fill();
    y += PENNANT_WIDTH + 1;
  }

  // Small gap after pennants
  if (pennants > 0) y += 1;

  // Draw full barbs (long lines)
  for (let i = 0; i < fullBarbs; i++) {
    ctx.beginPath();
    ctx.moveTo(CENTER_X, y);
    ctx.lineTo(CENTER_X + BARB_LENGTH, y - 3);
    ctx.stroke();
    y += BARB_SPACING;
  }

  // Draw half barbs (short lines)
  for (let i = 0; i < halfBarbs; i++) {
    // If this is the only element (5 kt), offset it down from the top
    if (fullBarbs === 0 && pennants === 0) {
      y += BARB_SPACING;
    }
    ctx.beginPath();
    ctx.moveTo(CENTER_X, y);
    ctx.lineTo(CENTER_X + HALF_BARB_LENGTH, y - 2);
    ctx.stroke();
    y += BARB_SPACING;
  }

  // Station dot at center
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y + 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Pre-generate all wind barb icons as data URLs.
 * Returns a Map from speed bracket to data URL string.
 */
export function generateWindBarbIcons(): Map<number, string> {
  const icons = new Map<number, string>();

  for (let speed = 0; speed <= 100; speed += 5) {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    drawWindBarb(ctx, speed);
    icons.set(speed, canvas.toDataURL('image/png'));
  }

  return icons;
}

/**
 * Register all wind barb icons with a MapLibre map instance.
 * Each icon is loaded as an HTMLImageElement (most reliable addImage path).
 */
export async function registerWindBarbIcons(map: maplibregl.Map): Promise<void> {
  const icons = generateWindBarbIcons();

  const promises: Promise<void>[] = [];

  for (const [speed, dataUrl] of icons) {
    const iconId = `wind-barb-${speed}`;
    if (map.hasImage(iconId)) continue;

    promises.push(
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          if (!map.hasImage(iconId)) {
            map.addImage(iconId, img, { sdf: false });
          }
          resolve();
        };
        img.onerror = reject;
        img.src = dataUrl;
      }),
    );
  }

  await Promise.all(promises);
  console.log(`[WindBarb] Registered ${icons.size} wind barb icons`);
}
