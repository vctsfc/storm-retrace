import type { RenderedFrame } from './types';

/**
 * LRU cache for rendered radar frames (pre-computed blob URLs).
 *
 * Keys are formatted as `${scanKey}_${timestamp}_${product}_${elevation}_pv${paletteVersion}`.
 * On eviction, revokes the blob URL to release browser blob storage.
 *
 * Memory budget: Each entry is a blob URL string + ~100-300KB PNG in blob storage.
 * 250 entries ≈ 25-75 MB — much smaller than old ImageBitmap approach (12.3 MB each).
 * Sized to hold an entire event (typically 100-200 frames) for lag-free scrubbing.
 */
export class FrameCache {
  private cache = new Map<string, RenderedFrame>();
  private maxSize: number;

  constructor(maxSize = 250) {
    this.maxSize = maxSize;
  }

  static makeKey(scanKeyOrSiteId: string, timestamp: number, product: string, elevation: number, paletteVersion = 0, smoothing: string = 'none', sweepIndex?: number): string {
    const base = `${scanKeyOrSiteId}_${timestamp}_${product}_${elevation}_pv${paletteVersion}_sm${smoothing}`;
    return sweepIndex !== undefined ? `${base}_sw${sweepIndex}` : base;
  }

  get(key: string): RenderedFrame | undefined {
    const frame = this.cache.get(key);
    if (frame) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, frame);
    }
    return frame;
  }

  set(key: string, frame: RenderedFrame): void {
    // If key already exists, revoke old blob URL and delete
    if (this.cache.has(key)) {
      const old = this.cache.get(key);
      if (old?.blobUrl) URL.revokeObjectURL(old.blobUrl);
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const old = this.cache.get(oldestKey);
        if (old?.blobUrl) URL.revokeObjectURL(old.blobUrl);
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, frame);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    // Revoke all blob URLs before clearing
    for (const frame of this.cache.values()) {
      if (frame?.blobUrl) URL.revokeObjectURL(frame.blobUrl);
    }
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * LRU cache for raw scan ArrayBuffers to avoid re-downloading.
 * Each scan is ~1-8 MB (larger for dual-pol 2020+ data).
 * Cap at 15 entries ≈ 15-120 MB max. Kept moderate since raw scans
 * are only needed for re-render (product/palette switch), not display.
 * With SAILS, multiple sub-frames share the same S3 key, so effective
 * coverage is higher than the entry count suggests.
 */
export class RawScanCache {
  private cache = new Map<string, ArrayBuffer>();
  private maxSize: number;

  constructor(maxSize = 15) {
    this.maxSize = maxSize;
  }

  get(key: string): ArrayBuffer | undefined {
    const buf = this.cache.get(key);
    if (buf) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, buf);
    }
    return buf;
  }

  set(key: string, buffer: ArrayBuffer): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, buffer);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Singleton instances
export const frameCache = new FrameCache();
export const rawScanCache = new RawScanCache();
