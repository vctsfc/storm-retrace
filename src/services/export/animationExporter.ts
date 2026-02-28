/**
 * Animation exporter — MP4 (H.264) and GIF.
 *
 * Iterates through radar frames, captures the composited map canvas for each,
 * and encodes into a downloadable video file.
 *
 * MP4: WebCodecs VideoEncoder (H.264 High Profile) + mp4-muxer
 *   → DaVinci Resolve-compatible, high bitrate, up to 4K
 *
 * GIF: gifenc (quantize + encode)
 *   → Quick sharing, social media, smaller files
 *
 * Each radar frame is held for multiple video frames to produce smooth
 * constant-frame-rate output at the selected fps and speed.
 */

import type maplibregl from 'maplibre-gl';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
// @ts-ignore — gifenc has no TypeScript declarations
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { useTimelineStore } from '../../stores/timelineStore';
import { useRadarStore } from '../../stores/radarStore';
import { frameCache, FrameCache } from '../nexrad/frameCache';

export interface AnimationOptions {
  map: maplibregl.Map;
  format: 'mp4' | 'gif';
  fps: number;
  speed: number;
  startIndex: number;
  endIndex: number;
  onProgress: (progress: number, message: string) => void;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface AnimationResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  totalFrames: number;
  duration: number;
}

/**
 * Export an animation (MP4 or GIF) from the current map view.
 */
export async function exportAnimation(opts: AnimationOptions): Promise<AnimationResult> {
  const { map, format, fps, speed, startIndex, endIndex, onProgress, signal } = opts;

  const canvas = map.getCanvas();
  const width = canvas.width;
  const height = canvas.height;

  // Ensure dimensions are even (H.264 requires this)
  const exportWidth = width % 2 === 0 ? width : width - 1;
  const exportHeight = height % 2 === 0 ? height : height - 1;

  const radarFrameCount = endIndex - startIndex + 1;
  if (radarFrameCount <= 0) throw new Error('No frames in export range');

  // Calculate how many video frames per radar frame
  // At 1x speed, radar advances every 500ms → at 30fps, that's 15 video frames per radar frame
  const radarIntervalMs = 500 / speed;
  const videoFramesPerRadar = Math.max(1, Math.round(fps * radarIntervalMs / 1000));
  const totalVideoFrames = radarFrameCount * videoFramesPerRadar;
  const durationSeconds = totalVideoFrames / fps;

  console.log(
    `[Export] Starting ${format.toUpperCase()} export: ${radarFrameCount} radar frames × ` +
    `${videoFramesPerRadar} video frames each = ${totalVideoFrames} total @ ${fps}fps ` +
    `(${durationSeconds.toFixed(1)}s) — ${exportWidth}×${exportHeight}`,
  );

  onProgress(0, `Preparing ${format.toUpperCase()} export...`);

  if (format === 'mp4') {
    return exportMP4(opts, exportWidth, exportHeight, videoFramesPerRadar, totalVideoFrames);
  } else {
    return exportGIF(opts, exportWidth, exportHeight, videoFramesPerRadar, totalVideoFrames);
  }
}

/* ── MP4 Export (WebCodecs + mp4-muxer) ────────────────────────────────── */

async function exportMP4(
  opts: AnimationOptions,
  exportWidth: number,
  exportHeight: number,
  videoFramesPerRadar: number,
  totalVideoFrames: number,
): Promise<AnimationResult> {
  const { map, fps, startIndex, endIndex, onProgress, signal } = opts;
  const canvas = map.getCanvas();

  // Bitrate scales with resolution: ~20 Mbps at 1080p, ~50 Mbps at 4K
  const pixels = exportWidth * exportHeight;
  const bitrate = Math.round(Math.max(10_000_000, pixels * 24)); // ~24 bits/pixel

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: exportWidth,
      height: exportHeight,
      frameRate: fps,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? undefined),
    error: (e) => console.error('[Export] VideoEncoder error:', e),
  });

  // H.264 High Profile — best quality, widely compatible with DaVinci Resolve
  encoder.configure({
    codec: 'avc1.640033', // High Profile, Level 5.1 (supports up to 4K)
    width: exportWidth,
    height: exportHeight,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
    avc: { format: 'avc' },
  });

  let videoFrameIndex = 0;

  for (let radarIdx = startIndex; radarIdx <= endIndex; radarIdx++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    // Set timeline to this frame and wait for it to render
    await setFrameAndWait(map, radarIdx);

    // Capture the canvas as a VideoFrame and encode it for each video frame hold
    for (let hold = 0; hold < videoFramesPerRadar; hold++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

      const timestampMicros = Math.round(videoFrameIndex * (1_000_000 / fps));

      const frame = new VideoFrame(canvas, {
        timestamp: timestampMicros,
        visibleRect: { x: 0, y: 0, width: exportWidth, height: exportHeight },
      });

      // Keyframe every 2 seconds for good seek performance in DaVinci Resolve
      const keyFrame = videoFrameIndex % (fps * 2) === 0;
      encoder.encode(frame, { keyFrame });
      frame.close();

      videoFrameIndex++;
    }

    const progress = (radarIdx - startIndex + 1) / (endIndex - startIndex + 1);
    onProgress(progress * 0.9, `Encoding frame ${radarIdx - startIndex + 1}/${endIndex - startIndex + 1}...`);
  }

  onProgress(0.95, 'Finalizing MP4...');
  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  const filename = `storm-replay-${formatTimestamp()}.mp4`;

  onProgress(1, 'Done!');
  console.log(
    `[Export] MP4 complete: ${filename} — ${(blob.size / 1024 / 1024).toFixed(1)} MB, ` +
    `${totalVideoFrames} frames, ${(totalVideoFrames / fps).toFixed(1)}s`,
  );

  return {
    blob,
    filename,
    width: exportWidth,
    height: exportHeight,
    totalFrames: totalVideoFrames,
    duration: totalVideoFrames / fps,
  };
}

/* ── GIF Export (gifenc) ───────────────────────────────────────────────── */

async function exportGIF(
  opts: AnimationOptions,
  exportWidth: number,
  exportHeight: number,
  videoFramesPerRadar: number,
  totalVideoFrames: number,
): Promise<AnimationResult> {
  const { map, fps, startIndex, endIndex, onProgress, signal } = opts;
  const canvas = map.getCanvas();

  // For GIF, we use a lower frame rate to keep file size manageable
  // Each radar frame gets a delay in centiseconds (GIF timing unit)
  const delayPerRadarFrame = Math.round((videoFramesPerRadar / fps) * 100); // centiseconds

  // Scale down for GIF to keep file size reasonable (max 800px wide)
  const maxGifWidth = 800;
  const scale = exportWidth > maxGifWidth ? maxGifWidth / exportWidth : 1;
  const gifWidth = Math.round(exportWidth * scale);
  const gifHeight = Math.round(exportHeight * scale);
  // Ensure even dimensions
  const finalGifWidth = gifWidth % 2 === 0 ? gifWidth : gifWidth - 1;
  const finalGifHeight = gifHeight % 2 === 0 ? gifHeight : gifHeight - 1;

  const gif = GIFEncoder();

  // Temp canvas for scaling
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = finalGifWidth;
  tempCanvas.height = finalGifHeight;
  const tempCtx = tempCanvas.getContext('2d')!;

  for (let radarIdx = startIndex; radarIdx <= endIndex; radarIdx++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    await setFrameAndWait(map, radarIdx);

    // Draw scaled frame to temp canvas
    tempCtx.drawImage(canvas, 0, 0, exportWidth, exportHeight, 0, 0, finalGifWidth, finalGifHeight);
    const imageData = tempCtx.getImageData(0, 0, finalGifWidth, finalGifHeight);

    // Quantize to 256-color palette and encode frame
    const palette = quantize(imageData.data, 256);
    const indexed = applyPalette(imageData.data, palette);

    gif.writeFrame(indexed, finalGifWidth, finalGifHeight, {
      palette,
      delay: delayPerRadarFrame,
    });

    const progress = (radarIdx - startIndex + 1) / (endIndex - startIndex + 1);
    onProgress(progress * 0.95, `Encoding GIF frame ${radarIdx - startIndex + 1}/${endIndex - startIndex + 1}...`);

    // Yield to keep UI responsive
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress(0.98, 'Finalizing GIF...');
  gif.finish();

  const bytes = gif.bytes();
  const blob = new Blob([bytes], { type: 'image/gif' });
  const filename = `storm-replay-${formatTimestamp()}.gif`;

  onProgress(1, 'Done!');
  console.log(
    `[Export] GIF complete: ${filename} — ${(blob.size / 1024 / 1024).toFixed(1)} MB, ` +
    `${finalGifWidth}×${finalGifHeight}, ${endIndex - startIndex + 1} frames`,
  );

  return {
    blob,
    filename,
    width: finalGifWidth,
    height: finalGifHeight,
    totalFrames: endIndex - startIndex + 1,
    duration: (endIndex - startIndex + 1) * delayPerRadarFrame / 100,
  };
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

/**
 * Set the timeline to a specific frame index, wait for the radar frame
 * to be available in cache, then wait for MapLibre to render.
 */
async function setFrameAndWait(map: maplibregl.Map, frameIndex: number): Promise<void> {
  const { scanFiles } = useRadarStore.getState();
  const { frameTimes } = useTimelineStore.getState();
  const { product, elevationIndex, paletteVersion } = useRadarStore.getState();

  // Set the timeline index (triggers RadarLayer to display the frame)
  useTimelineStore.getState().setCurrentIndex(frameIndex);

  // Wait for the radar frame to be in cache
  if (frameIndex < scanFiles.length) {
    const scan = scanFiles[frameIndex];
    const key = FrameCache.makeKey(scan.key, scan.timestamp, product, elevationIndex, paletteVersion);
    let attempts = 0;
    while (!frameCache.has(key) && attempts < 200) { // Max 10 seconds
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }
  }

  // Wait for MapLibre to render the updated frame
  await waitForMapRender(map);
}

/** Wait for MapLibre to complete a render cycle. */
function waitForMapRender(map: maplibregl.Map): Promise<void> {
  return new Promise((resolve) => {
    // Use two render cycles to ensure the image source has been updated
    map.once('render', () => {
      requestAnimationFrame(() => {
        map.once('render', () => resolve());
        map.triggerRepaint();
      });
    });
    map.triggerRepaint();
  });
}

/** Generate a timestamp string for filenames. */
function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
