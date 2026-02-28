import { useEffect } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useRadarStore } from '../stores/radarStore';

/**
 * Global keyboard shortcuts for radar playback and product switching.
 *
 * Space        = Play/Pause
 * ArrowLeft    = Step back 1 frame
 * ArrowRight   = Step forward 1 frame
 * Shift+Left   = Step back 5 frames
 * Shift+Right  = Step forward 5 frames
 * [            = Set loop start
 * ]            = Set loop end
 * L            = Toggle loop
 * 1-5          = Speed (1x, 2x, 4x, 8x, 16x)
 * R            = Switch to REF
 * V            = Switch to VEL
 * Home         = Go to start
 * End          = Go to end
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const timeline = useTimelineStore.getState();
      const radar = useRadarStore.getState();

      switch (e.key) {
        case ' ':
          e.preventDefault();
          timeline.togglePlay();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          timeline.setPlaying(false);
          timeline.stepBackward(e.shiftKey ? 5 : 1);
          break;

        case 'ArrowRight':
          e.preventDefault();
          timeline.setPlaying(false);
          timeline.stepForward(e.shiftKey ? 5 : 1);
          break;

        case '[':
          e.preventDefault();
          timeline.setLoopStart();
          break;

        case ']':
          e.preventDefault();
          timeline.setLoopEnd();
          break;

        case 'l':
        case 'L':
          e.preventDefault();
          timeline.toggleLoop();
          break;

        case '1':
          e.preventDefault();
          timeline.setSpeed(1);
          break;
        case '2':
          e.preventDefault();
          timeline.setSpeed(2);
          break;
        case '3':
          e.preventDefault();
          timeline.setSpeed(4);
          break;
        case '4':
          e.preventDefault();
          timeline.setSpeed(8);
          break;
        case '5':
          e.preventDefault();
          timeline.setSpeed(16);
          break;

        case 'r':
        case 'R':
          e.preventDefault();
          radar.setProduct('REF');
          break;

        case 'v':
        case 'V':
          e.preventDefault();
          radar.setProduct('VEL');
          break;

        case 'Home':
          e.preventDefault();
          timeline.goToStart();
          break;

        case 'End':
          e.preventDefault();
          timeline.goToEnd();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
