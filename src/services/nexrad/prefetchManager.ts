/**
 * Prefetch manager for radar frames.
 *
 * Orchestrates ahead-of-playback downloading and rendering:
 * - Maintains a sliding window around the current frame index
 * - Downloads scans in parallel (up to MAX_CONCURRENT_DOWNLOADS)
 * - Dispatches decode+render to the worker pool
 * - Caches results in the FrameCache for instant display
 * - Supports cancellation when user jumps to a new position
 * - "Download All" mode for pre-caching the entire event
 * - Custom color table support: color table is passed to each worker job
 * - SAILS support: scanFile.sweepIndex is threaded through to the worker
 *   for per-sweep rendering; rawScanCache is keyed by S3 key so multiple
 *   sweeps from the same volume share a single download.
 */

import { fetchScan } from './s3Client';
import { getWorkerPool } from './workerPool';
import { frameCache, rawScanCache, FrameCache } from './frameCache';
import type { ScanFile } from './types';
import type { ColorStop } from './colorTables';

const LOOK_AHEAD = 3;
const LOOK_BEHIND = 1;
const MAX_CONCURRENT_DOWNLOADS = 2;

/**
 * Look up the actual 1-based elevation number for a given elevation index.
 * SAILS volumes have non-sequential elevation numbers; this reads the mapping
 * from the store (set by the first decoded frame). Falls back to index+1
 * if the mapping isn't available yet.
 */
async function resolveElevationNumber(elevationIndex: number): Promise<number> {
  const { useRadarStore } = await import('../../stores/radarStore');
  const nums = useRadarStore.getState().availableElevationNumbers;
  return nums.length > elevationIndex ? nums[elevationIndex] : elevationIndex + 1;
}

type FrameReadyCallback = (cacheKey: string) => void;

interface PrefetchJob {
  cacheKey: string;
  scanFile: ScanFile;
  product: 'REF' | 'VEL';
  elevationNumber: number;
  siteLat: number;
  siteLon: number;
  priority: number; // 0 = highest (current frame)
  abortController: AbortController;
  colorTable?: ColorStop[];
  smoothing?: 'none' | 'low' | 'high';
  sweepIndex?: number;
}

export class PrefetchManager {
  private activeDownloads = new Map<string, AbortController>();
  private pendingKeys = new Set<string>();
  private jobQueue: PrefetchJob[] = [];
  private onFrameReady: FrameReadyCallback | null = null;
  private downloadAllActive = false;
  private downloadAllAbort: AbortController | null = null;
  private downloadAllProgress = { completed: 0, total: 0 };

  /**
   * Register a callback for when a frame becomes available in the cache.
   */
  setOnFrameReady(cb: FrameReadyCallback): void {
    this.onFrameReady = cb;
  }

  /**
   * Update the prefetch window based on current playback position.
   * Cancels out-of-window jobs and queues new ones.
   */
  async updateWindow(
    currentIndex: number,
    scanFiles: ScanFile[],
    product: 'REF' | 'VEL',
    elevationIndex: number,
    siteLat: number,
    siteLon: number,
    colorTable?: ColorStop[],
    paletteVersion = 0,
    smoothing: 'none' | 'low' | 'high' = 'none',
  ): Promise<void> {
    if (scanFiles.length === 0) return;

    const elevationNumber = await resolveElevationNumber(elevationIndex);

    // Compute window indices
    const windowIndices: { index: number; priority: number }[] = [];

    // Current frame (highest priority)
    windowIndices.push({ index: currentIndex, priority: 0 });

    // Look-ahead
    for (let i = 1; i <= LOOK_AHEAD; i++) {
      const idx = currentIndex + i;
      if (idx < scanFiles.length) {
        windowIndices.push({ index: idx, priority: i <= 2 ? 1 : (i <= 4 ? 2 : 3) });
      }
    }

    // Look-behind
    for (let i = 1; i <= LOOK_BEHIND; i++) {
      const idx = currentIndex - i;
      if (idx >= 0) {
        windowIndices.push({ index: idx, priority: 4 });
      }
    }

    // Compute cache keys for the window
    const windowKeys = new Set<string>();
    const jobs: PrefetchJob[] = [];

    for (const { index, priority } of windowIndices) {
      const scan = scanFiles[index];
      const key = FrameCache.makeKey(scan.key, scan.timestamp, product, elevationIndex, paletteVersion, smoothing, scan.sweepIndex);
      windowKeys.add(key);

      // Skip if already cached or already being fetched
      if (frameCache.has(key) || this.activeDownloads.has(key) || this.pendingKeys.has(key)) {
        continue;
      }

      jobs.push({
        cacheKey: key,
        scanFile: scan,
        product,
        elevationNumber,
        siteLat,
        siteLon,
        priority,
        abortController: new AbortController(),
        colorTable,
        smoothing,
        sweepIndex: scan.sweepIndex,
      });
    }

    // Cancel active downloads that are outside the new window (unless download-all is active)
    if (!this.downloadAllActive) {
      for (const [key, controller] of this.activeDownloads) {
        if (!windowKeys.has(key)) {
          controller.abort();
          this.activeDownloads.delete(key);
        }
      }
    }

    // Abort all queued (waiting) jobs — they're from a previous window position
    for (const queuedJob of this.jobQueue) {
      queuedJob.abortController.abort();
    }
    this.jobQueue = [];
    this.pendingKeys.clear();

    // Sort by priority and enqueue
    jobs.sort((a, b) => a.priority - b.priority);

    for (const job of jobs) {
      this.pendingKeys.add(job.cacheKey);
      this.jobQueue.push(job);
    }

    // Drain the queue (starts jobs up to MAX_CONCURRENT_DOWNLOADS)
    this.drainQueue();
  }

  /**
   * Request a specific frame immediately (e.g., for the current frame on manual step).
   * Returns true if the frame is already cached.
   */
  async requestFrame(
    scanFile: ScanFile,
    product: 'REF' | 'VEL',
    elevationIndex: number,
    siteLat: number,
    siteLon: number,
    colorTable?: ColorStop[],
    paletteVersion = 0,
    smoothing: 'none' | 'low' | 'high' = 'none',
  ): Promise<boolean> {
    const key = FrameCache.makeKey(scanFile.key, scanFile.timestamp, product, elevationIndex, paletteVersion, smoothing, scanFile.sweepIndex);

    if (frameCache.has(key)) return true;
    if (this.activeDownloads.has(key) || this.pendingKeys.has(key)) return false;

    const elevationNumber = await resolveElevationNumber(elevationIndex);

    const job: PrefetchJob = {
      cacheKey: key,
      scanFile,
      product,
      elevationNumber,
      siteLat,
      siteLon,
      priority: 0,
      abortController: new AbortController(),
      colorTable,
      smoothing,
      sweepIndex: scanFile.sweepIndex,
    };

    this.pendingKeys.add(key);
    this.processJobAsync(job);
    return false;
  }

  /**
   * Cancel all active and pending downloads.
   */
  cancelAll(): void {
    for (const [, controller] of this.activeDownloads) {
      controller.abort();
    }
    this.activeDownloads.clear();

    // Abort and clear queued jobs
    for (const job of this.jobQueue) {
      job.abortController.abort();
    }
    this.jobQueue = [];
    this.pendingKeys.clear();

    if (this.downloadAllActive) {
      this.downloadAllAbort?.abort();
      this.downloadAllActive = false;
      this.downloadAllAbort = null;
    }
  }

  /**
   * Download and pre-render ALL frames for the current event.
   *
   * Uses spiral ordering from startIndex (current position) outward so
   * frames near the user's position are cached first. Maintains a rolling
   * concurrency pool of BULK_CONCURRENCY parallel downloads for maximum
   * throughput without overwhelming the browser.
   */
  async downloadAll(
    scanFiles: ScanFile[],
    product: 'REF' | 'VEL',
    elevationIndex: number,
    siteLat: number,
    siteLon: number,
    onProgress?: (completed: number, total: number) => void,
    colorTable?: ColorStop[],
    paletteVersion = 0,
    startIndex = 0,
    smoothing: 'none' | 'low' | 'high' = 'none',
  ): Promise<void> {
    // Cancel any existing download-all before starting new one
    if (this.downloadAllActive) {
      this.downloadAllAbort?.abort();
    }

    this.downloadAllActive = true;
    this.downloadAllAbort = new AbortController();

    const elevationNumber = await resolveElevationNumber(elevationIndex);
    const signal = this.downloadAllAbort.signal;
    const total = scanFiles.length;
    const BULK_CONCURRENCY = 4;

    // Generate spiral order: [startIndex, start+1, start-1, start+2, start-2, ...]
    // Ensures frames near the user's current position are cached first.
    const orderedIndices: number[] = [];
    if (startIndex >= 0 && startIndex < total) {
      orderedIndices.push(startIndex);
    }
    for (let offset = 1; offset < total; offset++) {
      const ahead = startIndex + offset;
      const behind = startIndex - offset;
      if (ahead < total) orderedIndices.push(ahead);
      if (behind >= 0) orderedIndices.push(behind);
    }

    // Count already-cached frames for accurate initial progress
    let completed = 0;
    for (const idx of orderedIndices) {
      const scan = scanFiles[idx];
      const key = FrameCache.makeKey(scan.key, scan.timestamp, product, elevationIndex, paletteVersion, smoothing, scan.sweepIndex);
      if (frameCache.has(key)) {
        completed++;
      }
    }
    onProgress?.(completed, total);

    // Concurrent limiter: always maintain BULK_CONCURRENCY active jobs.
    // Unlike batch processing, a new job starts immediately when one finishes.
    const active = new Set<Promise<void>>();

    for (const idx of orderedIndices) {
      if (signal.aborted) break;

      const scan = scanFiles[idx];
      const key = FrameCache.makeKey(scan.key, scan.timestamp, product, elevationIndex, paletteVersion, smoothing, scan.sweepIndex);

      // Skip already cached (counted above)
      if (frameCache.has(key)) continue;

      // Wait if at concurrency limit — as soon as one finishes, we proceed
      if (active.size >= BULK_CONCURRENCY) {
        await Promise.race(active);
      }
      if (signal.aborted) break;

      const job: PrefetchJob = {
        cacheKey: key,
        scanFile: scan,
        product,
        elevationNumber,
        siteLat,
        siteLon,
        priority: 5,
        abortController: this.downloadAllAbort!,
        colorTable,
        smoothing,
        sweepIndex: scan.sweepIndex,
      };

      const p = this.processJobAsync(job).then(() => {
        completed++;
        onProgress?.(completed, total);
        active.delete(p);
      });
      active.add(p);
    }

    // Wait for remaining in-flight jobs
    if (active.size > 0) {
      await Promise.all(active);
    }

    this.downloadAllActive = false;
    this.downloadAllAbort = null;
  }

  /**
   * Whether download-all is in progress.
   */
  get isDownloadingAll(): boolean {
    return this.downloadAllActive;
  }

  // ── Private ────────────────────────────────────────────────────────

  /**
   * Drain the job queue: start jobs up to MAX_CONCURRENT_DOWNLOADS.
   * Called after queue changes and after each job completes.
   * No busy-wait — each completed job triggers the next dequeue.
   */
  private drainQueue(): void {
    while (this.activeDownloads.size < MAX_CONCURRENT_DOWNLOADS && this.jobQueue.length > 0) {
      const job = this.jobQueue.shift()!;

      // Skip if already aborted (window moved on)
      if (job.abortController.signal.aborted) {
        this.pendingKeys.delete(job.cacheKey);
        continue;
      }

      this.pendingKeys.delete(job.cacheKey);
      this.activeDownloads.set(job.cacheKey, job.abortController);

      this.fetchDecodeRender(job)
        .catch((err: any) => {
          if (err?.name !== 'AbortError' && err?.message !== 'Cancelled') {
            console.warn(`[Prefetch] Failed: ${job.scanFile.key}`, err?.message);
          }
        })
        .finally(() => {
          this.activeDownloads.delete(job.cacheKey);
          this.drainQueue(); // Process next queued job
        });
    }
  }

  private async processJobAsync(job: PrefetchJob): Promise<void> {
    try {
      await this.fetchDecodeRender(job);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'Cancelled') {
        console.warn(`[Prefetch] Failed: ${job.scanFile.key}`, err?.message);
      }
    }
  }

  private async fetchDecodeRender(job: PrefetchJob): Promise<void> {
    const { cacheKey, scanFile, product, elevationNumber, siteLat, siteLon, abortController, colorTable, smoothing, sweepIndex } = job;
    const signal = abortController.signal;

    // 1. Get raw scan data (memory cache → network)
    // Key by S3 key — multiple sweeps from the same volume share one download
    let buffer = rawScanCache.get(scanFile.key);
    if (!buffer) {
      buffer = await fetchScan(scanFile.key, signal);
      if (signal.aborted) return;
      rawScanCache.set(scanFile.key, buffer);
    }

    // 2. Copy buffer for worker (transfer makes original unusable)
    const bufferCopy = buffer.slice(0);

    // 3. Dispatch to worker pool for decode + render
    const pool = getWorkerPool();
    const result = await pool.process({
      scanBuffer: bufferCopy,
      scanKey: scanFile.key,
      product,
      elevationNumber,
      siteLat,
      siteLon,
      colorTable,
      smoothing,
      sweepIndex,
    });

    if (signal.aborted) {
      return;
    }

    if (result.imageBuffer) {
      // 4. Create blob URL from the worker's PNG ArrayBuffer (instant, ~0ms)
      const blob = new Blob([result.imageBuffer], { type: 'image/png' });
      const blobUrl = URL.createObjectURL(blob);

      // 5. Store in frame cache with pre-computed blob URL
      frameCache.set(cacheKey, {
        blobUrl,
        timestamp: result.sweepTimestamp ?? result.timestamp!,
        product: result.product!,
        elevation: result.elevation!,
        siteLat: result.siteLat!,
        siteLon: result.siteLon!,
        rangeKm: result.rangeKm!,
      });

      // 6. Store elevations metadata if available
      if (result.elevations && result.elevations.length > 0) {
        // Import dynamically to avoid circular deps
        const { useRadarStore } = await import('../../stores/radarStore');
        const currentElevations = useRadarStore.getState().availableElevations;
        if (currentElevations.length === 0) {
          useRadarStore.getState().setAvailableElevations(result.elevations, result.elevationNumbers);
        }
      }

      // 7. Notify listener
      this.onFrameReady?.(cacheKey);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

let instance: PrefetchManager | null = null;

export function getPrefetchManager(): PrefetchManager {
  if (!instance) {
    instance = new PrefetchManager();
  }
  return instance;
}
