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

  return (
    <div className="distance-bearing-overlay">
      <div className="distance-bearing-distance">
        {data.distanceMi.toFixed(1)}
        <span className="distance-bearing-unit">mi</span>
      </div>
      <div className="distance-bearing-bearing">
        {Math.round(data.bearingDeg)}° {data.cardinal}
      </div>
      <div className="distance-bearing-label">Chaser → Storm</div>
    </div>
  );
}
