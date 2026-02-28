import { useRef, useCallback, useState, useMemo } from 'react';
import { useRadarStore, getActiveColorTable } from '../../stores/radarStore';
import { valueToColor } from '../../services/nexrad/renderLogic';
import type { ColorStop } from '../../services/nexrad/colorTables';

/** Unit label per product */
const PRODUCT_UNITS: Record<string, string> = {
  REF: 'dBZ',
  VEL: 'm/s',
  ZDR: 'dB',
  CC: '',
  KDP: '°/km',
};

/** Compute the visible value range for a color table (skip transparent REF entries). */
function getVisibleRange(table: ColorStop[], product: string) {
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

/**
 * Pick ~6-8 tick values that fall on "round" numbers within the table range.
 */
function computeTicks(table: ColorStop[], product: string): number[] {
  if (table.length < 2) return [];

  const { minVal, maxVal } = getVisibleRange(table, product);
  const range = maxVal - minVal;
  if (range <= 0) return [minVal];

  const targetTicks = 7;
  const rawStep = range / targetTicks;
  const niceSteps = [5, 10, 15, 20, 25, 50];
  const step = niceSteps.reduce((best, s) =>
    Math.abs(s - rawStep) < Math.abs(best - rawStep) ? s : best
  );

  const ticks: number[] = [];
  const first = Math.ceil(minVal / step) * step;
  for (let v = first; v <= maxVal; v += step) {
    ticks.push(v);
  }
  return ticks;
}

const GRADIENT_STEPS = 100; // Number of discrete stops in the CSS gradient

/**
 * Build a CSS linear-gradient string from the color table.
 * Uses hard color stops (no interpolation) to match the discrete step-function
 * rendering used by the radar imagery.
 */
function buildGradient(table: ColorStop[], product: string): string {
  if (table.length < 2) return 'transparent';

  const { minVal, maxVal } = getVisibleRange(table, product);
  const range = maxVal - minVal;
  if (range <= 0) return 'transparent';

  const stops: string[] = [];
  for (let i = 0; i <= GRADIENT_STEPS; i++) {
    const val = minVal + (i / GRADIENT_STEPS) * range;
    const color = valueToColor(val, table) ?? 'transparent';
    const pct = (i / GRADIENT_STEPS) * 100;
    stops.push(`${color} ${pct.toFixed(1)}%`);
  }

  return `linear-gradient(to right, ${stops.join(', ')})`;
}

const BAR_WIDTH = 260;

/**
 * Interactive radar color legend overlay in the lower-left corner of the map.
 * Shows the active color palette with value labels. Hover to see exact values.
 */
export function RadarLegend() {
  const product = useRadarStore((s) => s.product);
  const paletteName = useRadarStore((s) => s.paletteName);
  const paletteVersion = useRadarStore((s) => s.paletteVersion);
  const scanFiles = useRadarStore((s) => s.scanFiles);

  const barRef = useRef<HTMLDivElement>(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [hoverColor, setHoverColor] = useState<string | null>(null);

  // Resolve color table — subscribe to paletteName so we react to palette changes
  const activeTable = useMemo(
    () => getActiveColorTable(useRadarStore.getState(), product),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product, paletteName, paletteVersion],
  );

  // Build CSS gradient string
  const gradientStyle = useMemo(() => {
    if (!activeTable || activeTable.length < 2) return 'transparent';
    return buildGradient(activeTable, product);
  }, [activeTable, product]);

  // Handle mouse move over the gradient bar
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeTable || activeTable.length < 2) return;
    const el = barRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, x / rect.width));

    const { minVal, maxVal } = getVisibleRange(activeTable, product);
    const val = minVal + frac * (maxVal - minVal);
    const rounded = Math.round(val * 10) / 10;

    setHoverValue(rounded);
    setHoverColor(valueToColor(val, activeTable));
  }, [activeTable, product]);

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null);
    setHoverColor(null);
  }, []);

  // Don't render unless data is loaded
  if (scanFiles.length === 0) return null;
  if (!activeTable || activeTable.length < 2) return null;

  const ticks = computeTicks(activeTable, product);
  const { minVal, maxVal } = getVisibleRange(activeTable, product);
  const range = maxVal - minVal;
  const unit = PRODUCT_UNITS[product] ?? '';

  return (
    <div className="radar-legend">
      <div className="radar-legend-header">
        <span className="radar-legend-product">{product}</span>
        {unit && <span className="radar-legend-unit">{unit}</span>}
        {hoverValue !== null && (
          <span className="radar-legend-hover">
            {hoverColor && (
              <span
                className="radar-legend-swatch"
                style={{ background: hoverColor }}
              />
            )}
            {hoverValue}
          </span>
        )}
      </div>
      <div
        ref={barRef}
        className="radar-legend-bar"
        style={{ width: BAR_WIDTH, background: gradientStyle }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <div className="radar-legend-ticks" style={{ width: BAR_WIDTH }}>
        {ticks.map((v) => {
          const pct = range > 0 ? ((v - minVal) / range) * 100 : 0;
          return (
            <span
              key={v}
              className="radar-legend-tick"
              style={{ left: `${pct}%` }}
            >
              {v}
            </span>
          );
        })}
      </div>
    </div>
  );
}
