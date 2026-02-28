/**
 * Radar decode + render Web Worker.
 *
 * Moves the entire heavy pipeline off the main thread:
 *   pako.ungzip → Buffer.from → Level2Radar parse → OffscreenCanvas render → ImageBitmap
 *
 * Includes a parsed-radar LRU cache so that product switches (REF→VEL)
 * skip the expensive gunzip+parse (~300-500ms) and only re-render (~100-200ms).
 *
 * SAILS support: when sweepIndex is specified, renders only the requested sweep
 * from within a volume. Multiple sub-frame entries share the same parsed cache entry.
 *
 * Buffer polyfill: nexrad-level-2-data does `file instanceof Buffer` internally.
 * We assign the `buffer` npm package's Buffer to globalThis before any imports
 * of the library, so the instanceof check passes within the worker bundle.
 */

// ── Buffer polyfill (MUST be before nexrad-level-2-data import) ─────
import { Buffer } from 'buffer';
(self as any).Buffer = Buffer;
(self as any).global = self; // Some libs check for `global`

import pako from 'pako';
import { Level2Radar } from 'nexrad-level-2-data';
import {
  parseRadarBuffer,
  renderFromParsed,
  detectSailsElevations,
  computeFrameStats,
  CANVAS_SIZE,
  type ParsedRadarData,
} from './renderLogic';
import type { ColorStop } from './colorTables';

// ── Message types ───────────────────────────────────────────────────

export interface WorkerRequest {
  id: number;
  type: 'decode-render' | 'probe-sweeps';
  payload: {
    scanBuffer: ArrayBuffer;
    scanKey?: string; // S3 key for parsed-radar cache lookup
    product: 'REF' | 'VEL';
    elevationNumber: number;
    siteLat: number;
    siteLon: number;
    canvasSize?: number;
    colorTable?: ColorStop[]; // Custom color palette (serialized, ~1-2KB)
    smoothing?: 'none' | 'low' | 'high';  // Polar-space interpolation mode
    sweepIndex?: number; // 0-based sweep within volume (SAILS sub-frame)
  };
}

export interface WorkerResponse {
  id: number;
  type: 'frame-ready' | 'error' | 'sweep-probe';
  payload: {
    /** PNG image as ArrayBuffer (transferred zero-copy) for instant blob URL creation */
    imageBuffer?: ArrayBuffer;
    imageBitmap?: ImageBitmap; // Legacy — unused, kept for type compat
    timestamp?: number;
    product?: string;
    elevation?: number;
    siteLat?: number;
    siteLon?: number;
    rangeKm?: number;
    elevations?: number[];
    /** 1-based elevation numbers corresponding to each entry in elevations */
    elevationNumbers?: number[];
    vcp?: number;
    siteId?: string;
    error?: string;
    /** Actual timestamp from sweep radials (when SAILS sweep was rendered) */
    sweepTimestamp?: number;
    /** Number of sweeps detected at this elevation */
    sweepCount?: number;
    /** Frame statistics for storm attributes overlay */
    frameStats?: {
      vcp: number;
      elevationAngle: number;
      maxRef: number | null;
      gatesAbove50: number;
      gatesAbove60: number;
      maxInboundVel: number | null;
      maxOutboundVel: number | null;
    };
  };
}

// ── Parsed radar LRU cache ──────────────────────────────────────────
// Size 3: SAILS sub-frames share the same S3 key (hit same entry), so we
// only need slots for current volume + previous volume + one look-ahead.
// Each parsed Level2Radar holds ALL elevations/products (~40-60 MB each).
const PARSED_CACHE_SIZE = 3;
const parsedCache = new Map<string, ParsedRadarData>();

function getCachedParsed(key: string): ParsedRadarData | undefined {
  const entry = parsedCache.get(key);
  if (entry) {
    // Move to end (most recently used)
    parsedCache.delete(key);
    parsedCache.set(key, entry);
  }
  return entry;
}

function setCachedParsed(key: string, data: ParsedRadarData): void {
  if (parsedCache.has(key)) {
    parsedCache.delete(key);
  }
  while (parsedCache.size >= PARSED_CACHE_SIZE) {
    const oldest = parsedCache.keys().next().value;
    if (oldest !== undefined) parsedCache.delete(oldest);
  }
  parsedCache.set(key, data);
}

// ── Persistent canvas ───────────────────────────────────────────────
// Reuse a single OffscreenCanvas across renders to avoid GPU memory churn.
// Each 1800×1800 canvas = ~12.96 MB in GPU/backing store. Creating a new
// one per frame during rapid downloadAll causes GC to fall behind, leaking
// GPU memory until the browser OOMs. Safe to reuse because workers process
// one job at a time and convertToBlob() copies the pixel data to the blob.
let persistentCanvas: OffscreenCanvas | null = null;
let persistentCtx: OffscreenCanvasRenderingContext2D | null = null;

function createCanvas(w: number, h: number) {
  if (!persistentCanvas || persistentCanvas.width !== w || persistentCanvas.height !== h) {
    persistentCanvas = new OffscreenCanvas(w, h);
    persistentCtx = persistentCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    if (!persistentCtx) throw new Error('Failed to get OffscreenCanvas 2d context');
  }
  return { ctx: persistentCtx!, canvas: persistentCanvas };
}

// ── Helper: parse or get cached ─────────────────────────────────────

function getOrParseScan(
  scanBuffer: ArrayBuffer,
  scanKey: string | undefined,
  siteLat: number,
  siteLon: number,
): ParsedRadarData | null {
  const cacheKey = scanKey ?? '';
  const cached = cacheKey ? getCachedParsed(cacheKey) : undefined;
  if (cached) return cached;

  const parsed = parseRadarBuffer(scanBuffer, siteLat, siteLon, {
    gunzip: (data: Uint8Array) => pako.ungzip(data),
    createRadar: (buf: any) => new Level2Radar(buf),
    wrapBuffer: (data: Uint8Array) => Buffer.from(data),
  });

  if (parsed && cacheKey) {
    setCachedParsed(cacheKey, parsed);
  }
  return parsed;
}

// ── Worker message handler ──────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = e.data;

  // ── Probe sweep count (lightweight, no rendering) ──
  if (type === 'probe-sweeps') {
    const { scanBuffer, scanKey, siteLat, siteLon } = payload;
    try {
      console.log(`[Worker] probe-sweeps: parsing ${scanKey ?? 'unknown'} (${scanBuffer.byteLength} bytes)`);
      const parsed = getOrParseScan(scanBuffer, scanKey, siteLat, siteLon);
      if (!parsed) {
        console.warn('[Worker] probe-sweeps: parseRadarBuffer returned null');
        postResponse({ id, type: 'error', payload: { error: 'parseRadarBuffer returned null' } });
        return;
      }
      const sails = detectSailsElevations(parsed.radar);
      console.log(`[Worker] probe-sweeps: VCP ${parsed.vcp}, sweepCount=${sails.sweepCount}, elevAngle=${sails.elevationAngle}°`);
      postResponse({
        id,
        type: 'sweep-probe',
        payload: {
          sweepCount: sails.sweepCount,
          vcp: parsed.vcp,
        },
      });
    } catch (err: any) {
      console.error('[Worker] probe-sweeps error:', err);
      postResponse({ id, type: 'error', payload: { error: err?.message ?? String(err) } });
    }
    return;
  }

  if (type !== 'decode-render') {
    postResponse({ id, type: 'error', payload: { error: `Unknown message type: ${type}` } });
    return;
  }

  const { scanBuffer, scanKey, product, elevationNumber, siteLat, siteLon, canvasSize, colorTable, smoothing, sweepIndex } = payload;
  const size = canvasSize ?? CANVAS_SIZE;

  try {
    const parsed = getOrParseScan(scanBuffer, scanKey, siteLat, siteLon);

    if (!parsed) {
      postResponse({ id, type: 'error', payload: { error: 'parseRadarBuffer returned null' } });
      return;
    }

    const result = renderFromParsed(parsed, product, elevationNumber, size, { createCanvas }, colorTable, smoothing, sweepIndex);

    if (!result) {
      postResponse({ id, type: 'error', payload: { error: 'renderFromParsed returned null (no data at elevation)' } });
      return;
    }

    // Convert OffscreenCanvas to PNG blob, then to ArrayBuffer for zero-copy transfer.
    // This moves the expensive PNG encoding off the main thread entirely.
    const blob = await (result.canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    const imageBuffer = await blob.arrayBuffer();

    // Compute frame stats for the storm attributes overlay
    const frameStats = computeFrameStats(parsed.radar, parsed.vcp, result.elevation);

    const response: WorkerResponse = {
      id,
      type: 'frame-ready',
      payload: {
        imageBuffer,
        timestamp: result.timestamp,
        product: result.product,
        elevation: result.elevation,
        siteLat: result.siteLat,
        siteLon: result.siteLon,
        rangeKm: result.rangeKm,
        elevations: result.elevations,
        elevationNumbers: result.elevationNumbers,
        vcp: result.vcp,
        siteId: result.siteId,
        sweepTimestamp: result.sweepTimestamp,
        sweepCount: result.sweepCount,
        frameStats,
      },
    };

    // Transfer the ArrayBuffer (zero-copy)
    (self as any).postMessage(response, [imageBuffer]);
  } catch (err: any) {
    postResponse({
      id,
      type: 'error',
      payload: { error: err?.message ?? String(err) },
    });
  }
};

function postResponse(response: WorkerResponse) {
  (self as any).postMessage(response);
}

// Signal that the worker is ready
(self as any).postMessage({ type: 'ready' });
