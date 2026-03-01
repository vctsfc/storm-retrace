/**
 * Overlay compositing for exports.
 *
 * Provides Canvas 2D drawing functions that reproduce the three React
 * map overlays (Storm Attributes, Radar Legend, Distance to Storm)
 * so they can be composited onto screenshots and animation frames.
 */

import { useRadarStore, getActiveColorTable } from '../../stores/radarStore';
import { getDistanceBearingData } from '../../components/map/DistanceBearingLayer';
import { valueToColor } from '../nexrad/renderLogic';
import type { ColorStop } from '../nexrad/colorTables';

/* ── Theme constants (hardcoded — Canvas 2D can't use CSS vars) ───── */

const BG_COLOR = 'rgba(13, 17, 23, 0.82)';
const BORDER_COLOR = '#30363d';
const TEXT_PRIMARY = '#e6edf3';
const TEXT_SECONDARY = '#8b949e';
const TEXT_MUTED = '#484f58';
const ACCENT = '#58a6ff';
const COLOR_SEVERE = '#ff4444';
const COLOR_VEL_IN = '#44cc44';
const COLOR_VEL_OUT = '#ff6644';
const FONT_MONO = '"SF Mono", "Cascadia Code", "Fira Code", monospace';
const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const PRODUCT_UNITS: Record<string, string> = {
  REF: 'dBZ',
  VEL: 'm/s',
  ZDR: 'dB',
  CC: '',
  KDP: '°/km',
};

/* ── Types ────────────────────────────────────────────────────────── */

export interface OverlayOptions {
  showStormAttrs: boolean;
  showRadarLegend: boolean;
  showDistanceBearing: boolean;
}

/** Position and size of a DOM overlay element, in canvas pixel coordinates. */
export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** All overlay positions captured at export start. */
export interface OverlayPositions {
  stormAttrs: OverlayRect | null;
  radarLegend: OverlayRect | null;
  distanceBearing: OverlayRect | null;
}

/* ── Position capture ─────────────────────────────────────────────── */

/**
 * Read the DOM positions of overlay elements relative to the map
 * container, scaled to canvas pixel coordinates. Call once at the
 * start of an export.
 */
export function captureOverlayPositions(
  mapCanvas: HTMLCanvasElement,
): OverlayPositions {
  const mapContainer =
    mapCanvas.closest('.map-container') ?? mapCanvas.parentElement!;
  const containerRect = mapContainer.getBoundingClientRect();
  const scaleX = mapCanvas.width / containerRect.width;
  const scaleY = mapCanvas.height / containerRect.height;

  function getRect(selector: string): OverlayRect | null {
    const el = mapContainer.querySelector(selector) as HTMLElement | null;
    if (!el || el.offsetParent === null) return null; // not visible
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - containerRect.left) * scaleX,
      y: (r.top - containerRect.top) * scaleY,
      width: r.width * scaleX,
      height: r.height * scaleY,
    };
  }

  return {
    stormAttrs: getRect('.storm-attrs-overlay'),
    radarLegend: getRect('.radar-legend'),
    distanceBearing: getRect('.distance-bearing-overlay'),
  };
}

/* ── Compositing (single-shot for screenshots) ────────────────────── */

/**
 * Create an offscreen canvas with the map image + enabled overlays.
 * Used by the screenshot exporter.
 */
export function compositeOverlays(
  mapCanvas: HTMLCanvasElement,
  positions: OverlayPositions,
  options: OverlayOptions,
  exportWidth: number,
  exportHeight: number,
): HTMLCanvasElement {
  const compCanvas = document.createElement('canvas');
  compCanvas.width = exportWidth;
  compCanvas.height = exportHeight;
  const ctx = compCanvas.getContext('2d')!;

  // Draw map canvas
  ctx.drawImage(mapCanvas, 0, 0, exportWidth, exportHeight);

  const mapContainer =
    mapCanvas.closest('.map-container') ?? mapCanvas.parentElement!;
  const scale = mapCanvas.width / mapContainer.getBoundingClientRect().width;

  drawOverlaysOntoContext(ctx, positions, options, scale);

  return compCanvas;
}

/**
 * Draw enabled overlays onto an existing context.
 * Used by the animation exporter (reusable canvas across frames).
 */
export function drawOverlaysOntoContext(
  ctx: CanvasRenderingContext2D,
  positions: OverlayPositions,
  options: OverlayOptions,
  scale: number,
): void {
  if (options.showRadarLegend && positions.radarLegend) {
    drawRadarLegendOverlay(ctx, positions.radarLegend, scale);
  }
  if (options.showStormAttrs && positions.stormAttrs) {
    drawStormAttributesOverlay(ctx, positions.stormAttrs, scale);
  }
  if (options.showDistanceBearing && positions.distanceBearing) {
    drawDistanceBearingOverlay(ctx, positions.distanceBearing, scale);
  }
}

/* ── Storm Attributes drawing ─────────────────────────────────────── */

function drawStormAttributesOverlay(
  ctx: CanvasRenderingContext2D,
  rect: OverlayRect,
  scale: number,
): void {
  const stats = useRadarStore.getState().currentFrameStats;
  if (!stats) return;

  drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 6 * scale);

  // Title
  ctx.font = `600 ${10 * scale}px ${FONT_SANS}`;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('STORM ATTRIBUTES', rect.x + 12 * scale, rect.y + 8 * scale);

  // Grid rows
  const rows: [string, string, string][] = [
    ['VCP', typeof stats.vcp === 'number' ? String(stats.vcp) : '—', TEXT_PRIMARY],
    [
      'Max REF',
      typeof stats.maxRef === 'number' ? `${stats.maxRef.toFixed(1)} dBZ` : '—',
      TEXT_PRIMARY,
    ],
    [
      'Gates 50+',
      typeof stats.gatesAbove50 === 'number' ? stats.gatesAbove50.toLocaleString() : '0',
      TEXT_PRIMARY,
    ],
    [
      'Gates 60+',
      typeof stats.gatesAbove60 === 'number' ? stats.gatesAbove60.toLocaleString() : '0',
      COLOR_SEVERE,
    ],
    [
      'Max In',
      typeof stats.maxInboundVel === 'number' ? `${stats.maxInboundVel.toFixed(1)} kts` : '—',
      COLOR_VEL_IN,
    ],
    [
      'Max Out',
      typeof stats.maxOutboundVel === 'number' ? `${stats.maxOutboundVel.toFixed(1)} kts` : '—',
      COLOR_VEL_OUT,
    ],
  ];

  const startY = rect.y + 24 * scale;
  const lineHeight = 16 * scale;
  const labelX = rect.x + 12 * scale;
  const valueX = rect.x + rect.width - 12 * scale;

  rows.forEach(([label, value, color], i) => {
    const y = startY + i * lineHeight;
    // Label
    ctx.font = `${11 * scale}px ${FONT_MONO}`;
    ctx.fillStyle = TEXT_MUTED;
    ctx.textAlign = 'left';
    ctx.fillText(label, labelX, y);
    // Value
    ctx.font = `600 ${12 * scale}px ${FONT_MONO}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.fillText(value, valueX, y);
  });

  ctx.textAlign = 'left'; // reset
}

/* ── Distance & Bearing drawing ───────────────────────────────────── */

function drawDistanceBearingOverlay(
  ctx: CanvasRenderingContext2D,
  rect: OverlayRect,
  scale: number,
): void {
  const data = getDistanceBearingData();
  if (!data) return;

  const dist = typeof data.distanceMi === 'number' ? data.distanceMi : 0;
  const bearing = typeof data.bearingDeg === 'number' ? data.bearingDeg : 0;

  drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 8 * scale);

  const centerX = rect.x + rect.width / 2;

  // ── Arrow (rotated by bearing) ──
  const arrowSize = 40 * scale;
  const arrowCenterX = centerX;
  const arrowCenterY = rect.y + 10 * scale + arrowSize / 2;

  ctx.save();
  ctx.translate(arrowCenterX, arrowCenterY);
  ctx.rotate((bearing * Math.PI) / 180);

  // Draw upward-pointing arrow (0° = north)
  const aW = arrowSize * 0.42; // half-width of arrowhead
  const aH = arrowSize * 0.45; // arrowhead height
  const sW = arrowSize * 0.16; // shaft half-width
  const sH = arrowSize * 0.38; // shaft height

  ctx.beginPath();
  ctx.moveTo(0, -arrowSize / 2);             // tip
  ctx.lineTo(aW, -arrowSize / 2 + aH);       // right wing
  ctx.lineTo(sW, -arrowSize / 2 + aH);       // right notch
  ctx.lineTo(sW, arrowSize / 2);              // bottom right
  ctx.lineTo(-sW, arrowSize / 2);             // bottom left
  ctx.lineTo(-sW, -arrowSize / 2 + aH);      // left notch
  ctx.lineTo(-aW, -arrowSize / 2 + aH);      // left wing
  ctx.closePath();

  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  ctx.restore();

  // ── Distance value + unit ──
  const distY = rect.y + 10 * scale + arrowSize + 6 * scale;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${28 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = TEXT_PRIMARY;
  const distStr = dist.toFixed(1);
  const distMetrics = ctx.measureText(distStr);

  ctx.fillText(distStr, centerX - 8 * scale, distY);

  // Unit "mi" to the right
  ctx.font = `${14 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.textAlign = 'left';
  ctx.fillText(
    'mi',
    centerX - 8 * scale + distMetrics.width / 2 + 3 * scale,
    distY + 14 * scale,
  );

  // ── Label ──
  ctx.textAlign = 'center';
  ctx.font = `${10 * scale}px ${FONT_SANS}`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText('CHASER → STORM', centerX, distY + 36 * scale);

  ctx.textAlign = 'left'; // reset
}

/* ── Radar Legend drawing ─────────────────────────────────────────── */

function drawRadarLegendOverlay(
  ctx: CanvasRenderingContext2D,
  rect: OverlayRect,
  scale: number,
): void {
  const state = useRadarStore.getState();
  const { product } = state;
  const colorTable = getActiveColorTable(state, product);
  if (!colorTable || colorTable.length < 2) return;

  drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 6 * scale);

  const unit = PRODUCT_UNITS[product] ?? '';

  // Header: product name + unit
  const headerY = rect.y + 6 * scale;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `700 ${12 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.fillText(product, rect.x + 10 * scale, headerY);

  if (unit) {
    ctx.font = `${11 * scale}px ${FONT_MONO}`;
    ctx.fillStyle = TEXT_SECONDARY;
    const prodWidth = ctx.measureText(product).width;
    ctx.fillText(unit, rect.x + 10 * scale + prodWidth + 6 * scale, headerY);
  }

  // Gradient bar
  const barX = rect.x + 10 * scale;
  const barY = headerY + 18 * scale;
  const barWidth = rect.width - 20 * scale;
  const barHeight = 14 * scale;

  // Visible range (skip transparent REF entries)
  const { minVal, maxVal } = getVisibleRange(colorTable, product);
  const range = maxVal - minVal;
  if (range <= 0) return;

  // Draw gradient as discrete color steps
  const STEPS = 100;
  const stepWidth = barWidth / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const val = minVal + (i / STEPS) * range;
    const color = valueToColor(val, colorTable);
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(barX + i * stepWidth, barY, stepWidth + 0.5, barHeight);
    }
  }

  // Bar border
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  // Tick marks
  const tickY = barY + barHeight + 2 * scale;
  ctx.font = `${9 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const ticks = computeTicks(minVal, maxVal, range);
  for (const v of ticks) {
    const pct = (v - minVal) / range;
    const x = barX + pct * barWidth;
    ctx.fillText(String(v), x, tickY);
  }

  ctx.textAlign = 'left'; // reset
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = BG_COLOR;
  ctx.fill();
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function getVisibleRange(
  table: ColorStop[],
  product: string,
): { minVal: number; maxVal: number } {
  let startIdx = 0;
  if (product === 'REF') {
    startIdx = table.findIndex((s) => s.a > 0.5);
    if (startIdx < 0) startIdx = 0;
  }
  return {
    minVal: table[startIdx].value,
    maxVal: table[table.length - 1].value,
  };
}

function computeTicks(minVal: number, maxVal: number, range: number): number[] {
  const targetTicks = 7;
  const rawStep = range / targetTicks;
  const niceSteps = [5, 10, 15, 20, 25, 50];
  const step = niceSteps.reduce((best, s) =>
    Math.abs(s - rawStep) < Math.abs(best - rawStep) ? s : best,
  );
  const ticks: number[] = [];
  const first = Math.ceil(minVal / step) * step;
  for (let v = first; v <= maxVal; v += step) {
    ticks.push(v);
  }
  return ticks;
}
