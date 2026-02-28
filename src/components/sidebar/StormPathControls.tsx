/**
 * Storm path drawing controls for the Radar sidebar section.
 *
 * Allows users to draw a storm movement path on the map and
 * optionally follow the interpolated storm position during playback.
 */

import { useStormPathStore } from '../../stores/stormPathStore';
import { useTrackStore } from '../../stores/trackStore';

export function StormPathControls() {
  const stormWaypoints = useStormPathStore((s) => s.waypoints);
  const drawingMode = useStormPathStore((s) => s.drawingMode);
  const followStorm = useStormPathStore((s) => s.followStorm);
  const startDrawing = useStormPathStore((s) => s.startDrawing);
  const finishDrawing = useStormPathStore((s) => s.finishDrawing);
  const undoWaypoint = useStormPathStore((s) => s.undoWaypoint);
  const clearPath = useStormPathStore((s) => s.clearPath);
  const setFollowStorm = useStormPathStore((s) => s.setFollowStorm);

  const followTrack = useTrackStore((s) => s.followTrack);
  const setFollowTrack = useTrackStore((s) => s.setFollowTrack);

  return (
    <div className="layer-toggle-group">
      <span className="layer-toggle-label" style={{ fontSize: 12, marginBottom: 2 }}>
        Storm Path
        {stormWaypoints.length > 0 && !drawingMode && (
          <span className="layer-badge count">{stormWaypoints.length} pts</span>
        )}
      </span>

      {drawingMode ? (
        <div className="storm-path-controls">
          <span className="storm-path-hint">
            Click on map to place waypoints ({stormWaypoints.length} placed)
          </span>
          <div className="storm-path-btn-row">
            <button
              className="storm-path-btn"
              onClick={undoWaypoint}
              disabled={stormWaypoints.length === 0}
              title="Undo last waypoint"
            >
              Undo
            </button>
            <button
              className="storm-path-btn storm-path-finish"
              onClick={finishDrawing}
              disabled={stormWaypoints.length < 2}
              title="Finish drawing (need at least 2 points)"
            >
              Finish
            </button>
          </div>
        </div>
      ) : (
        <div className="storm-path-controls">
          <div className="storm-path-btn-row">
            <button className="storm-path-btn" onClick={startDrawing}>
              {stormWaypoints.length > 0 ? 'Redraw' : 'Draw Path'}
            </button>
            {stormWaypoints.length > 0 && (
              <button className="storm-path-btn storm-path-clear" onClick={clearPath}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {stormWaypoints.length >= 2 && !drawingMode && (
        <label className="layer-toggle-row sub-toggle">
          <input
            type="checkbox"
            checked={followStorm}
            onChange={(e) => {
              setFollowStorm(e.target.checked);
              // Mutually exclusive with follow chaser
              if (e.target.checked && followTrack) setFollowTrack(false);
            }}
          />
          <span className="layer-toggle-label">Follow storm</span>
        </label>
      )}
    </div>
  );
}
