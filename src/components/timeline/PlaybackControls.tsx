import { useTimelineStore } from '../../stores/timelineStore';

const SPEEDS = [1, 2, 4, 8, 16];

/**
 * Transport controls: step back, play/pause, step forward, speed selector.
 */
export function PlaybackControls() {
  const playing = useTimelineStore((s) => s.playing);
  const speed = useTimelineStore((s) => s.speed);
  const frameTimes = useTimelineStore((s) => s.frameTimes);
  const togglePlay = useTimelineStore((s) => s.togglePlay);
  const stepForward = useTimelineStore((s) => s.stepForward);
  const stepBackward = useTimelineStore((s) => s.stepBackward);
  const setSpeed = useTimelineStore((s) => s.setSpeed);
  const goToStart = useTimelineStore((s) => s.goToStart);
  const goToEnd = useTimelineStore((s) => s.goToEnd);
  const loopEnabled = useTimelineStore((s) => s.loopEnabled);
  const toggleLoop = useTimelineStore((s) => s.toggleLoop);

  const disabled = frameTimes.length === 0;

  return (
    <div className="playback-controls">
      <button onClick={goToStart} disabled={disabled} title="Go to start (Home)">
        &#x23EE;
      </button>
      <button onClick={() => stepBackward()} disabled={disabled} title="Step back (Left)">
        &#x23EA;
      </button>
      <button onClick={togglePlay} disabled={disabled} title="Play/Pause (Space)">
        {playing ? '\u23F8' : '\u25B6'}
      </button>
      <button onClick={() => stepForward()} disabled={disabled} title="Step forward (Right)">
        &#x23E9;
      </button>
      <button onClick={goToEnd} disabled={disabled} title="Go to end (End)">
        &#x23ED;
      </button>

      <button
        onClick={toggleLoop}
        className={loopEnabled ? 'active' : ''}
        title="Toggle loop (L)"
        style={{ marginLeft: 8 }}
      >
        &#x1F501;
      </button>

      <div className="speed-selector">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={speed === s ? 'active' : ''}
            onClick={() => setSpeed(s)}
            disabled={disabled}
            title={`${s}x speed`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
