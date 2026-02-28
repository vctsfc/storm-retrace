/**
 * Screenshot exporter.
 *
 * Captures the current map canvas (basemap + radar + all overlay layers)
 * as a PNG image and triggers a browser download. Optionally composites
 * React overlay components (Storm Attributes, Radar Legend, Distance to
 * Storm) onto the image based on export store settings.
 *
 * Requires `preserveDrawingBuffer: true` on the MapLibre map instance.
 */

import type maplibregl from 'maplibre-gl';
import { useExportStore } from '../../stores/exportStore';
import {
  compositeOverlays,
  captureOverlayPositions,
  type OverlayOptions,
} from './overlayRenderer';

/**
 * Capture the current map view as a PNG and download it.
 *
 * @param map - MapLibre GL map instance
 * @param filename - Download filename (defaults to timestamped name)
 */
export async function exportScreenshot(
  map: maplibregl.Map,
  filename?: string,
): Promise<void> {
  // Force a render to ensure the canvas is up to date
  map.triggerRepaint();
  await waitForRender(map);

  const canvas = map.getCanvas();
  const exportWidth = canvas.width;
  const exportHeight = canvas.height;

  // Read overlay options from store
  const { showStormAttrs, showRadarLegend, showDistanceBearing } =
    useExportStore.getState();
  const overlayOptions: OverlayOptions = {
    showStormAttrs,
    showRadarLegend,
    showDistanceBearing,
  };
  const anyOverlays = showStormAttrs || showRadarLegend || showDistanceBearing;

  let exportCanvas: HTMLCanvasElement;
  if (anyOverlays) {
    const positions = captureOverlayPositions(canvas);
    exportCanvas = compositeOverlays(
      canvas,
      positions,
      overlayOptions,
      exportWidth,
      exportHeight,
    );
  } else {
    exportCanvas = canvas;
  }

  const blob = await canvasToBlob(exportCanvas);
  const name = filename ?? `storm-replay-${formatTimestamp()}.png`;
  downloadBlob(blob, name);

  // Clean up compositing canvas if created
  if (exportCanvas !== canvas) {
    exportCanvas.width = 0;
    exportCanvas.height = 0;
  }

  console.log(
    `[Export] Screenshot saved: ${name} (${canvas.width}×${canvas.height})`,
  );
}

/** Wait for MapLibre to complete a render cycle. */
function waitForRender(map: maplibregl.Map): Promise<void> {
  return new Promise((resolve) => {
    map.once('render', () => resolve());
    map.triggerRepaint();
  });
}

/** Convert a canvas to a PNG Blob. */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/png',
    );
  });
}

/** Generate a timestamp string for filenames. */
function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Trigger a browser download for a Blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after a short delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
