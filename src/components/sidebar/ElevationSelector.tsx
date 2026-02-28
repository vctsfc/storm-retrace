import { useRadarStore } from '../../stores/radarStore';

/**
 * Dropdown for selecting radar elevation angle.
 *
 * Renders inline content (no section wrapper) — grouped under
 * the "Radar" collapsible section in Sidebar.tsx.
 */
export function ElevationSelector() {
  const elevationIndex = useRadarStore((s) => s.elevationIndex);
  const availableElevations = useRadarStore((s) => s.availableElevations);
  const setElevationIndex = useRadarStore((s) => s.setElevationIndex);

  if (availableElevations.length === 0) return null;

  return (
    <div className="elevation-selector">
      <select
        value={elevationIndex}
        onChange={(e) => setElevationIndex(parseInt(e.target.value, 10))}
      >
        {availableElevations.map((el, idx) => (
          <option key={idx} value={idx}>
            {typeof el === 'number' ? `${el.toFixed(1)}°` : `Tilt ${idx + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}
