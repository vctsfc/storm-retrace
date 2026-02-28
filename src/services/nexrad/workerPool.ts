/**
 * Pool of radar decode+render Web Workers.
 *
 * Manages N workers, dispatching decode-render requests with a promise-based API.
 * Uses a FIFO queue when all workers are busy. Supports cancellation of all
 * pending work (e.g. when user scrubs to a new position).
 */

import type { WorkerRequest, WorkerResponse } from './radar.worker';
import type { ColorStop } from './colorTables';

interface PendingRequest {
  request: WorkerRequest;
  resolve: (response: WorkerResponse['payload']) => void;
  reject: (error: Error) => void;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  currentRequestId: number | null;
}

export class RadarWorkerPool {
  private slots: WorkerSlot[] = [];
  private queue: PendingRequest[] = [];
  private callbacks = new Map<number, PendingRequest>();
  private nextId = 1;
  private ready = false;
  private readyPromise: Promise<void>;

  constructor(poolSize = 2) {
    let resolveReady: () => void;
    this.readyPromise = new Promise((resolve) => { resolveReady = resolve; });

    let readyCount = 0;

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(
        new URL('./radar.worker.ts', import.meta.url),
        { type: 'module' },
      );

      const slot: WorkerSlot = { worker, busy: false, currentRequestId: null };
      this.slots.push(slot);

      worker.onmessage = (e: MessageEvent) => {
        // Handle ready signal
        if (e.data?.type === 'ready') {
          readyCount++;
          if (readyCount >= poolSize) {
            this.ready = true;
            resolveReady!();
          }
          return;
        }

        const response = e.data as WorkerResponse;
        const pending = this.callbacks.get(response.id);

        // Only mark slot as free if this response matches the current request.
        // After cancelAll(), a stale response may arrive for a request that
        // was already discarded while the slot was re-assigned to a new task.
        if (slot.currentRequestId === response.id) {
          slot.busy = false;
          slot.currentRequestId = null;
        }

        if (pending) {
          this.callbacks.delete(response.id);
          if (response.type === 'error') {
            pending.reject(new Error(response.payload.error ?? 'Worker error'));
          } else {
            pending.resolve(response.payload);
          }
        }

        // Process next item in queue
        this.processQueue();
      };

      worker.onerror = (err) => {
        console.error('[WorkerPool] Worker error:', err);

        // Reject current request if any (must read ID before clearing slot state)
        const failedRequestId = slot.currentRequestId;
        slot.busy = false;
        slot.currentRequestId = null;

        if (failedRequestId !== null) {
          const pending = this.callbacks.get(failedRequestId);
          if (pending) {
            this.callbacks.delete(failedRequestId);
            pending.reject(new Error('Worker crashed'));
          }
        }

        this.processQueue();
      };
    }

    // If workers don't send ready signal within 5s, consider them ready anyway
    setTimeout(() => {
      if (!this.ready) {
        this.ready = true;
        resolveReady!();
      }
    }, 5000);
  }

  /**
   * Wait for all workers to be ready.
   */
  async waitReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Submit a decode+render request. Returns a promise that resolves with the result.
   * The scanBuffer is TRANSFERRED (zero-copy), so it becomes unusable in the caller.
   */
  async process(params: {
    scanBuffer: ArrayBuffer;
    scanKey?: string;
    product: 'REF' | 'VEL';
    elevationNumber: number;
    siteLat: number;
    siteLon: number;
    canvasSize?: number;
    colorTable?: ColorStop[];
    smoothing?: 'none' | 'low' | 'high';
    sweepIndex?: number;
  }): Promise<WorkerResponse['payload']> {
    await this.readyPromise;

    const id = this.nextId++;
    const request: WorkerRequest = {
      id,
      type: 'decode-render',
      payload: params,
    };

    return new Promise((resolve, reject) => {
      const pending: PendingRequest = { request, resolve, reject };
      this.callbacks.set(id, pending);

      // Try to dispatch immediately if a worker is free
      const freeSlot = this.slots.find((s) => !s.busy);
      if (freeSlot) {
        this.dispatch(freeSlot, pending);
      } else {
        this.queue.push(pending);
      }
    });
  }

  /**
   * Probe a scan file for SAILS sweep count without rendering.
   * Returns the sweep count and VCP from the worker.
   */
  async probeSweeps(params: {
    scanBuffer: ArrayBuffer;
    scanKey?: string;
    elevationNumber: number;
    siteLat: number;
    siteLon: number;
  }): Promise<WorkerResponse['payload']> {
    await this.readyPromise;

    const id = this.nextId++;
    const request: WorkerRequest = {
      id,
      type: 'probe-sweeps',
      payload: {
        ...params,
        product: 'REF', // Dummy, not used for probe
      },
    };

    return new Promise((resolve, reject) => {
      const pending: PendingRequest = { request, resolve, reject };
      this.callbacks.set(id, pending);

      const freeSlot = this.slots.find((s) => !s.busy);
      if (freeSlot) {
        this.dispatch(freeSlot, pending);
      } else {
        this.queue.push(pending);
      }
    });
  }

  /**
   * Cancel all pending and queued work.
   * In-flight worker tasks will complete but their results will be discarded.
   */
  cancelAll(): void {
    // Reject all queued requests
    for (const pending of this.queue) {
      this.callbacks.delete(pending.request.id);
      pending.reject(new Error('Cancelled'));
    }
    this.queue = [];

    // Reject all in-flight requests (results will be ignored when they arrive)
    for (const [id, pending] of this.callbacks) {
      pending.reject(new Error('Cancelled'));
    }
    this.callbacks.clear();

    // Reset slot state (workers will finish their current task but results are discarded)
    for (const slot of this.slots) {
      slot.busy = false;
      slot.currentRequestId = null;
    }
  }

  /**
   * Terminate all workers. Use when the pool is no longer needed.
   */
  destroy(): void {
    this.cancelAll();
    for (const slot of this.slots) {
      slot.worker.terminate();
    }
    this.slots = [];
  }

  /**
   * Number of pending items in the queue.
   */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Number of busy workers.
   */
  get busyCount(): number {
    return this.slots.filter((s) => s.busy).length;
  }

  // ── Private ────────────────────────────────────────────────────────

  private dispatch(slot: WorkerSlot, pending: PendingRequest): void {
    slot.busy = true;
    slot.currentRequestId = pending.request.id;

    // Transfer the ArrayBuffer (zero-copy to worker)
    const transferables = [pending.request.payload.scanBuffer];
    slot.worker.postMessage(pending.request, transferables);
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const freeSlot = this.slots.find((s) => !s.busy);
      if (!freeSlot) break;

      const next = this.queue.shift()!;
      // Check if this request was already cancelled
      if (!this.callbacks.has(next.request.id)) continue;
      this.dispatch(freeSlot, next);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

let poolInstance: RadarWorkerPool | null = null;

export function getWorkerPool(): RadarWorkerPool {
  if (!poolInstance) {
    poolInstance = new RadarWorkerPool(2);
  }
  return poolInstance;
}

/**
 * Terminate all workers and destroy the pool.
 * Frees all worker-side memory (parsed radar cache, OffscreenCanvas, etc.).
 * A fresh pool is lazily created on the next getWorkerPool() call.
 */
export function resetWorkerPool(): void {
  if (poolInstance) {
    poolInstance.destroy();
    poolInstance = null;
  }
}
