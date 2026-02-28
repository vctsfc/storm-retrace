import { useRef, useState, useEffect, useCallback } from 'react';
import { useRadarStore, getActiveColorTable } from '../../stores/radarStore';
import { getBuiltinPaletteNames } from '../../services/nexrad/colorTables';
import { parsePalFile } from '../../services/nexrad/palParser';
import { valueToColor } from '../../services/nexrad/renderLogic';
import type { ColorStop } from '../../services/nexrad/colorTables';

/**
 * Sidebar section for selecting and importing radar color palettes.
 *
 * - Dropdown lists built-in + imported palettes for the current product
 * - "Import .pal" button opens a file picker for GRLevelX/RadarScope .pal files
 * - Color bar preview shows the active palette
 */
export function PaletteSelector() {
  const product = useRadarStore((s) => s.product);
  const paletteName = useRadarStore((s) => s.paletteName);
  const customPalettes = useRadarStore((s) => s.customPalettes);
  const paletteVersion = useRadarStore((s) => s.paletteVersion);
  const setPalette = useRadarStore((s) => s.setPalette);
  const addCustomPalette = useRadarStore((s) => s.addCustomPalette);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Current palette name for this product
  const activeName = paletteName[product] ?? 'NWS Default';

  // Build list of available palettes for the current product
  const builtinNames = getBuiltinPaletteNames(product);
  const customNames = Object.keys(customPalettes[product] ?? {});
  const allNames = [...builtinNames, ...customNames.filter((n) => !builtinNames.includes(n))];

  // Resolve active color table for preview
  const activeTable = getActiveColorTable(useRadarStore.getState(), product);

  // Draw color bar preview
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const table = activeTable;
    if (!canvas || !table || table.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const minVal = table[0].value;
    const maxVal = table[table.length - 1].value;
    const range = maxVal - minVal;
    if (range <= 0) return;

    for (let x = 0; x < width; x++) {
      const val = minVal + (x / width) * range;
      const color = valueToColor(val, table);
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, 0, 1, height);
      }
    }
  }, [activeTable]);

  // Redraw preview when palette changes
  useEffect(() => {
    drawPreview();
  }, [drawPreview, paletteVersion, product]);

  // Also redraw on canvas mount (resize observer for proper width)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width)) {
        canvas.width = Math.floor(rect.width);
        canvas.height = 12;
        drawPreview();
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawPreview]);

  const handlePaletteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setImportError(null);
    setPalette(product, e.target.value);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const result = parsePalFile(text);

        if (result.stops.length < 2) {
          setImportError('Invalid palette: too few color stops');
          return;
        }

        // Derive name from filename (strip .pal extension)
        let name = file.name.replace(/\.pal$/i, '').trim();
        if (!name) name = 'Custom';

        // If this palette specifies a product that doesn't match current, warn but still import
        if (result.product && result.product !== product) {
          console.warn(`[PaletteSelector] Imported palette is for ${result.product}, but current product is ${product}. Applying anyway.`);
        }

        addCustomPalette(product, name, result.stops);
        setPalette(product, name);
        setImportError(null);
      } catch (err: any) {
        setImportError(`Parse error: ${err.message ?? 'Unknown error'}`);
      }
    };

    reader.onerror = () => {
      setImportError('Failed to read file');
    };

    reader.readAsText(file);

    // Reset input so same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="palette-selector">
      <select value={activeName} onChange={handlePaletteChange}>
        {allNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      <div className="palette-import-row">
        <button type="button" onClick={handleImportClick}>
          Import .pal
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pal,.PAL"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {importError && (
        <div className="palette-error">{importError}</div>
      )}

      <canvas
        ref={canvasRef}
        className="palette-preview"
        width={200}
        height={12}
      />
    </div>
  );
}
