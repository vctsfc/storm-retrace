import { useEffect, useRef } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useRadarStore } from '../stores/radarStore';
import { frameCache, FrameCache } from '../services/nexrad/frameCache';

/**
 * Drives automatic radar playback using requestAnimationFrame.
 * Steps forward one frame at intervals based on the current speed setting.
 *
 * Base interval is ~500ms per frame at 1x speed (~5 min between scans shown in ~0.5s).
 * At 2x = 250ms, 4x = 125ms, 8x = 62ms, 16x = 31ms.
 *
 * Cache-aware: at high speeds (≥8x), skips frames that aren't cached yet
 * to prevent playback from stalling. At normal speeds, advances one-by-one
 * even if the frame isn't cached (prefetch manager is working on it).
 */
export function useRadarPlayback() {
  const rafRef = useRef<number>(0);
  const lastStepRef = useRef<number>(0);

  useEffect(() => {
    const tick = (now: number) => {
      const { playing, speed, stepForward, currentIndex, frameTimes, loopStart, loopEnd, loopEnabled } =
        useTimelineStore.getState();

      if (playing && frameTimes.length > 0) {
        const baseInterval = 500; // ms per frame at 1x
        const interval = baseInterval / speed;

        if (now - lastStepRef.current >= interval) {
          const { product, elevationIndex, scanFiles, paletteVersion, radarSmoothing } = useRadarStore.getState();

          if (speed >= 8 && scanFiles.length > 0) {
            // At high speeds, skip uncached frames to maintain smooth playback.
            // Look ahead up to `speed` frames for a cached one.
            const maxIndex = loopEnabled && loopEnd !== null ? loopEnd : frameTimes.length - 1;
            const minIndex = loopEnabled && loopStart !== null ? loopStart : 0;
            const maxSkip = Math.min(Math.ceil(speed / 2), 8);

            let found = false;
            for (let skip = 1; skip <= maxSkip; skip++) {
              let candidateIdx = currentIndex + skip;
              if (candidateIdx > maxIndex) {
                candidateIdx = loopEnabled ? minIndex + (candidateIdx - maxIndex - 1) : maxIndex;
              }
              if (candidateIdx >= scanFiles.length) candidateIdx = scanFiles.length - 1;

              const scan = scanFiles[candidateIdx];
              if (!scan) continue;

              const key = FrameCache.makeKey(scan.key, scan.timestamp, product, elevationIndex, paletteVersion, radarSmoothing, scan.sweepIndex);
              if (frameCache.has(key)) {
                // Jump to the cached frame
                useTimelineStore.getState().setCurrentIndex(candidateIdx);
                found = true;
                break;
              }
            }

            if (!found) {
              // No cached frame found in look-ahead; just step forward normally
              stepForward();
            }
          } else {
            // Normal speed: step one frame at a time
            stepForward();
          }

          lastStepRef.current = now;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
