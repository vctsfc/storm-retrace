/**
 * Export panel sidebar component.
 *
 * Controls for exporting screenshots (PNG), animated GIFs, and
 * production-quality MP4 videos compatible with DaVinci Resolve.
 */

import { useRef, useCallback } from 'react';
import { useMap } from '../map/MapContext';
import { useExportStore, type ExportFormat } from '../../stores/exportStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useRadarStore } from '../../stores/radarStore';
import { exportScreenshot } from '../../services/export/screenshotExporter';
import { exportAnimation, downloadBlob } from '../../services/export/animationExporter';
import { playChime } from '../../utils/chime';
import { CollapsibleSection } from './CollapsibleSection';

export function ExportPanel() {
  const map = useMap();
  const abortRef = useRef<AbortController | null>(null);

  const format = useExportStore((s) => s.format);
  const fps = useExportStore((s) => s.fps);
  const speed = useExportStore((s) => s.speed);
  const exporting = useExportStore((s) => s.exporting);
  const progress = useExportStore((s) => s.progress);
  const progressMessage = useExportStore((s) => s.progressMessage);
  const useLoopRange = useExportStore((s) => s.useLoopRange);
  const showStormAttrs = useExportStore((s) => s.showStormAttrs);
  const showRadarLegend = useExportStore((s) => s.showRadarLegend);
  const showDistanceBearing = useExportStore((s) => s.showDistanceBearing);
  const setFormat = useExportStore((s) => s.setFormat);
  const setFps = useExportStore((s) => s.setFps);
  const setSpeed = useExportStore((s) => s.setSpeed);
  const setExporting = useExportStore((s) => s.setExporting);
  const setProgress = useExportStore((s) => s.setProgress);
  const setUseLoopRange = useExportStore((s) => s.setUseLoopRange);
  const setShowStormAttrs = useExportStore((s) => s.setShowStormAttrs);
  const setShowRadarLegend = useExportStore((s) => s.setShowRadarLegend);
  const setShowDistanceBearing = useExportStore((s) => s.setShowDistanceBearing);

  const frameTimes = useTimelineStore((s) => s.frameTimes);
  const loopStart = useTimelineStore((s) => s.loopStart);
  const loopEnd = useTimelineStore((s) => s.loopEnd);

  const scanFiles = useRadarStore((s) => s.scanFiles);

  // Compute frame range
  const startIndex = useLoopRange && loopStart !== null ? loopStart : 0;
  const endIndex = useLoopRange && loopEnd !== null ? loopEnd : frameTimes.length - 1;
  const frameCount = Math.max(0, endIndex - startIndex + 1);

  // Canvas dimensions
  const canvasWidth = map?.getCanvas().width ?? 0;
  const canvasHeight = map?.getCanvas().height ?? 0;

  // Estimate video duration
  const radarIntervalMs = 500 / speed;
  const videoFramesPerRadar = Math.max(1, Math.round(fps * radarIntervalMs / 1000));
  const estimatedDuration = format === 'png' ? 0 : (frameCount * videoFramesPerRadar) / fps;

  const hasFrames = frameTimes.length > 0 && scanFiles.length > 0;
  const hasLoopRange = loopStart !== null && loopEnd !== null;

  const handleScreenshot = useCallback(async () => {
    if (!map) return;
    setExporting(true);
    setProgress(0.5, 'Capturing screenshot...');
    try {
      await exportScreenshot(map);
      setProgress(1, 'Screenshot saved!');
    } catch (err) {
      console.error('[Export] Screenshot error:', err);
      setProgress(0, `Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTimeout(() => setExporting(false), 1500);
    }
  }, [map, setExporting, setProgress]);

  const handleAnimation = useCallback(async () => {
    if (!map || !hasFrames) return;

    // Pause playback during export
    const wasPlaying = useTimelineStore.getState().playing;
    if (wasPlaying) useTimelineStore.getState().setPlaying(false);

    const savedIndex = useTimelineStore.getState().currentIndex;
    const controller = new AbortController();
    abortRef.current = controller;

    setExporting(true);
    setProgress(0, 'Starting export...');

    try {
      const result = await exportAnimation({
        map,
        format: format as 'mp4' | 'gif',
        fps,
        speed,
        startIndex,
        endIndex,
        onProgress: (p, msg) => setProgress(p, msg),
        signal: controller.signal,
      });

      // Download the result and notify
      downloadBlob(result.blob, result.filename);
      setProgress(1, `Exported! ${result.width}×${result.height}, ${result.duration.toFixed(1)}s`);
      playChime();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setProgress(0, 'Export cancelled');
      } else {
        console.error('[Export] Animation error:', err);
        setProgress(0, `Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } finally {
      // Restore timeline position
      useTimelineStore.getState().setCurrentIndex(savedIndex);
      if (wasPlaying) useTimelineStore.getState().setPlaying(true);
      abortRef.current = null;
      setTimeout(() => setExporting(false), 2000);
    }
  }, [map, format, fps, speed, startIndex, endIndex, hasFrames, setExporting, setProgress]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleExport = format === 'png' ? handleScreenshot : handleAnimation;

  return (
    <CollapsibleSection
      title="Export"
      storageKey="export"
      defaultOpen={false}
      helpText="Save the current map view as a PNG screenshot, or export an animated GIF or MP4 video of the radar playback. Choose frame rate and playback speed for animations. If a loop range is set, you can export just that range. MP4 exports are compatible with video editors like DaVinci Resolve."
    >

      <div className="export-panel">
        {/* Format selector */}
        <div className="export-row">
          <label className="export-label">Format</label>
          <div className="export-format-btns">
            {(['png', 'gif', 'mp4'] as ExportFormat[]).map((f) => (
              <button
                key={f}
                className={`export-format-btn${format === f ? ' active' : ''}`}
                onClick={() => setFormat(f)}
                disabled={exporting}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution info */}
        <div className="export-info">
          {canvasWidth}×{canvasHeight}px
          {format === 'gif' && canvasWidth > 800 && (
            <span className="export-info-sub"> (GIF scaled to {Math.min(800, canvasWidth)}px wide)</span>
          )}
        </div>

        {/* Overlay include toggles */}
        <div className="export-overlay-group">
          <div className="export-overlay-label">Include in export</div>
          <label className="export-row export-checkbox">
            <input
              type="checkbox"
              checked={showStormAttrs}
              onChange={(e) => setShowStormAttrs(e.target.checked)}
              disabled={exporting}
            />
            <span>Storm Attributes</span>
          </label>
          <label className="export-row export-checkbox">
            <input
              type="checkbox"
              checked={showRadarLegend}
              onChange={(e) => setShowRadarLegend(e.target.checked)}
              disabled={exporting}
            />
            <span>Radar Legend</span>
          </label>
          <label className="export-row export-checkbox">
            <input
              type="checkbox"
              checked={showDistanceBearing}
              onChange={(e) => setShowDistanceBearing(e.target.checked)}
              disabled={exporting}
            />
            <span>Distance to Storm</span>
          </label>
        </div>

        {/* Animation-specific controls */}
        {format !== 'png' && (
          <>
            {/* FPS selector */}
            <div className="export-row">
              <label className="export-label">Frame Rate</label>
              <select
                className="export-select"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                disabled={exporting}
              >
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>

            {/* Speed selector */}
            <div className="export-row">
              <label className="export-label">Speed</label>
              <select
                className="export-select"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                disabled={exporting}
              >
                <option value={1}>1× (real-time)</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
                <option value={8}>8×</option>
                <option value={16}>16×</option>
              </select>
            </div>

            {/* Loop range toggle */}
            {hasLoopRange && (
              <label className="export-row export-checkbox">
                <input
                  type="checkbox"
                  checked={useLoopRange}
                  onChange={(e) => setUseLoopRange(e.target.checked)}
                  disabled={exporting}
                />
                <span>Export loop range only</span>
              </label>
            )}

            {/* Frame count & duration estimate */}
            <div className="export-info">
              {frameCount} radar frames → ~{estimatedDuration.toFixed(1)}s video
              {format === 'mp4' && (
                <span className="export-info-sub">
                  {' '}({videoFramesPerRadar} video frames per scan)
                </span>
              )}
            </div>
          </>
        )}

        {/* Export button / progress */}
        {exporting ? (
          <div className="export-progress-area">
            <div className="export-progress-bar">
              <div
                className="export-progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="export-progress-text">{progressMessage}</div>
            {progress < 1 && (
              <button className="export-cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <button
            className="export-btn"
            onClick={handleExport}
            disabled={!map || (!hasFrames && format !== 'png')}
          >
            {format === 'png' ? 'Save Screenshot' : `Export ${format.toUpperCase()}`}
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
}
