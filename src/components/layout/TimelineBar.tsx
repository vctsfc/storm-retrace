import { PlaybackControls } from '../timeline/PlaybackControls';
import { Scrubber } from '../timeline/Scrubber';
import { FrameInfo } from '../timeline/FrameInfo';
import '../../styles/timeline.css';

/**
 * Bottom timeline bar containing transport controls, scrubber, and frame info.
 */
export function TimelineBar() {
  return (
    <div className="timeline-bar">
      <PlaybackControls />
      <Scrubber />
      <FrameInfo />
    </div>
  );
}
