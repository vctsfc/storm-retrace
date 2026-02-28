import { useTimelineStore } from '../../stores/timelineStore';
import { useRadarStore, getSiteForFrame } from '../../stores/radarStore';
import { formatLocalTime, formatLocalDate, getTimezoneAbbr } from '../../utils/time';

/**
 * Displays current frame metadata: timestamp, site ID, VCP, elevation, cache progress.
 * Shows SAILS sweep indicator when sub-volume sweeps are available.
 */
export function FrameInfo() {
  const currentIndex = useTimelineStore((s) => s.currentIndex);
  const frameTimes = useTimelineStore((s) => s.frameTimes);
  const selectedSite = useRadarStore((s) => s.selectedSite);
  const product = useRadarStore((s) => s.product);
  const elevationIndex = useRadarStore((s) => s.elevationIndex);
  const availableElevations = useRadarStore((s) => s.availableElevations);
  const prefetchProgress = useRadarStore((s) => s.prefetchProgress);
  const scanFiles = useRadarStore((s) => s.scanFiles);

  const currentTime = frameTimes[currentIndex] ?? 0;
  const totalFrames = frameTimes.length;

  // Per-frame site info (multi-site handoff) with selectedSite fallback
  const activeSite = getSiteForFrame(currentIndex, scanFiles, selectedSite);
  const activeTz = activeSite?.tz ?? 'UTC';
  const activeSiteId = activeSite?.id ?? selectedSite?.id;

  const elevation = availableElevations[elevationIndex];
  const elevationStr = typeof elevation === 'number'
    ? `${elevation.toFixed(1)}°`
    : '';

  // SAILS sweep indicator
  const currentScan = scanFiles[currentIndex];
  const sweepCount = currentScan?.sweepCount;
  const sweepIndex = currentScan?.sweepIndex;
  const hasSails = sweepCount !== undefined && sweepCount > 1 && sweepIndex !== undefined;

  return (
    <div className="frame-info">
      {currentTime > 0 && (
        <>
          <span className="timestamp">
            {formatLocalTime(currentTime, activeTz)}{' '}
            {getTimezoneAbbr(currentTime, activeTz)}
          </span>
          <span>{formatLocalDate(currentTime, activeTz)}</span>
        </>
      )}
      {activeSiteId && <span>{activeSiteId}</span>}
      <span>{product}</span>
      {elevationStr && <span>{elevationStr}</span>}
      {hasSails && (
        <span className="sweep-indicator" title="SAILS supplemental sweep">
          Sweep {sweepIndex + 1}/{sweepCount}
        </span>
      )}
      {prefetchProgress && prefetchProgress.completed < prefetchProgress.total && (
        <span className="cache-progress">
          Caching: {prefetchProgress.completed}/{prefetchProgress.total}
        </span>
      )}
      {totalFrames > 0 && (
        <span className="frame-counter">
          {currentIndex + 1} / {totalFrames}
        </span>
      )}
    </div>
  );
}
