/**
 * Distance & Bearing floating overlay.
 *
 * Displays the distance (miles) and bearing from the chaser to the
 * interpolated storm position. Only visible when both a chase track
 * and storm path exist.
 */

import { useState, useEffect } from 'react';
import {
  getDistanceBearingData,
  subscribeDistanceBearing,
  type DistanceBearingData,
} from './DistanceBearingLayer';

export function DistanceBearingOverlay() {
  const [data, setData] = useState<DistanceBearingData | null>(null);

  useEffect(() => {
    // Initial read
    setData(getDistanceBearingData());
    // Subscribe to updates
    return subscribeDistanceBearing(() => {
      setData(getDistanceBearingData());
    });
  }, []);

  if (!data) return null;

  // Defensive: guard against malformed data
  const dist = typeof data.distanceMi === 'number' ? data.distanceMi : 0;
  const bearing = typeof data.bearingDeg === 'number' ? data.bearingDeg : 0;
  const cardinal = data.cardinal ?? '';

  return (
    <div className="distance-bearing-overlay">
      <div className="distance-bearing-distance">
        {dist.toFixed(1)}
        <span className="distance-bearing-unit">mi</span>
      </div>
      <div className="distance-bearing-bearing">
        {Math.round(bearing)}° {cardinal}
      </div>
      <div className="distance-bearing-label">Chaser → Storm</div>
    </div>
  );
}
