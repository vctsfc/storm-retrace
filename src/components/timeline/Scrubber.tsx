import { useCallback, useRef, useState } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useRadarStore } from '../../stores/radarStore';
import { formatLocalTime, getTimezoneAbbr } from '../../utils/time';

/**
 * Timeline scrubber track with draggable playhead, loop region, cache progress,
 * and hover tooltip showing the timestamp at the cursor position.
 */
export function Scrubber() {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const currentIndex = useTimelineStore((s) => s.currentIndex);
  const frameTimes = useTimelineStore((s) => s.frameTimes);
  const loopStart = useTimelineStore((s) => s.loopStart);
  const loopEnd = useTimelineStore((s) => s.loopEnd);
  const loopEnabled = useTimelineStore((s) => s.loopEnabled);
  const setCurrentIndex = useTimelineStore((s) => s.setCurrentIndex);
  const setPlaying = useTimelineStore((s) => s.setPlaying);
  const prefetchProgress = useRadarStore((s) => s.prefetchProgress);
  const segments = useRadarStore((s) => s.segments);
  const scanFiles = useRadarStore((s) => s.scanFiles);

  // Hover tooltip state
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;       // px offset within track
    time: string;     // formatted time string
    frameNum: number; // 1-based frame number
  } | null>(null);

  const totalFrames = frameTimes.length;
  const progress = totalFrames > 1 ? currentIndex / (totalFrames - 1) : 0;

  const scrubToPosition = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || totalFrames === 0) return;

      const rect = track.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const index = Math.round(fraction * (totalFrames - 1));
      setCurrentIndex(index);
    },
    [totalFrames, setCurrentIndex],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      setPlaying(false);
      scrubToPosition(e.clientX);

      const handleMouseMove = (e: MouseEvent) => {
        if (draggingRef.current) {
          scrubToPosition(e.clientX);
        }
      };

      const handleMouseUp = () => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [scrubToPosition, setPlaying],
  );

  // Hover: compute hovered frame index and format its time
  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const track = trackRef.current;
      if (!track || totalFrames === 0) return;

      const rect = track.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const index = Math.round(fraction * (totalFrames - 1));
      const ts = frameTimes[index];
      if (!ts) { setHoverInfo(null); return; }

      // In multi-site mode, use the per-frame site's timezone and show site ID
      const scan = scanFiles[index];
      const seg = scan?.siteId
        ? useRadarStore.getState().segments.find((s) => s.site.id === scan.siteId)
        : null;
      const tz = seg?.site.tz ?? useRadarStore.getState().selectedSite?.tz ?? 'UTC';
      const siteLabel = scan?.siteId ? ` (${scan.siteId})` : '';
      const time = `${formatLocalTime(ts, tz)} ${getTimezoneAbbr(ts, tz)}${siteLabel}`;

      setHoverInfo({
        x: e.clientX - rect.left,
        time,
        frameNum: index + 1,
      });
    },
    [totalFrames, frameTimes],
  );

  const handleTrackMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  // Loop region visualization
  const loopRegionStyle = loopEnabled && loopStart !== null && loopEnd !== null && totalFrames > 1
    ? {
        left: `${(loopStart / (totalFrames - 1)) * 100}%`,
        width: `${((loopEnd - loopStart) / (totalFrames - 1)) * 100}%`,
      }
    : null;

  // Cache progress percentage (0-100)
  const cachePercent = prefetchProgress
    ? Math.round((prefetchProgress.completed / Math.max(prefetchProgress.total, 1)) * 100)
    : null;

  return (
    <div className="scrubber-container">
      <div
        className="scrubber-track"
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleTrackMouseMove}
        onMouseLeave={handleTrackMouseLeave}
      >
        {/* Cache progress bar (behind everything, shows how many frames are pre-rendered) */}
        {cachePercent !== null && cachePercent < 100 && (
          <div
            className="scrubber-cache-progress"
            style={{ width: `${cachePercent}%` }}
          />
        )}

        {/* Frame tick marks */}
        <div className="frame-ticks">
          {totalFrames <= 200 &&
            frameTimes.map((_, i) => (
              <div
                key={i}
                className="frame-tick"
                style={{ left: `${(i / (totalFrames - 1)) * 100}%` }}
              />
            ))}
        </div>

        {/* Loop region highlight */}
        {loopRegionStyle && (
          <div className="loop-region" style={loopRegionStyle} />
        )}

        {/* Progress fill */}
        <div
          className="scrubber-progress"
          style={{ width: `${progress * 100}%` }}
        />

        {/* Playhead handle */}
        {totalFrames > 0 && (
          <div
            className="scrubber-handle"
            style={{ left: `${progress * 100}%` }}
          />
        )}

        {/* Handoff markers for multi-site segments */}
        {segments.length > 1 &&
          segments.slice(0, -1).map((seg, i) => {
            const boundaryIndex = frameTimes.findIndex((t) => t >= seg.endMs);
            if (boundaryIndex < 0 || totalFrames <= 1) return null;
            const pos = (boundaryIndex / (totalFrames - 1)) * 100;
            return (
              <div
                key={seg.id}
                className="handoff-marker"
                style={{ left: `${pos}%` }}
                title={`Handoff: ${seg.site.id} → ${segments[i + 1].site.id}`}
              />
            );
          })}

        {/* Hover time tooltip */}
        {hoverInfo && (
          <div
            className="scrubber-tooltip"
            style={{ left: hoverInfo.x }}
          >
            {hoverInfo.time}
          </div>
        )}
      </div>
    </div>
  );
}
