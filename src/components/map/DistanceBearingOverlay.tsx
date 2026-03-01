/**
 * Distance & Bearing floating overlay.
 *
 * Displays a bold directional arrow pointing from chaser toward the storm,
 * with the distance (miles) below. Only visible when both a chase track
 * and storm path exist. Draggable via pointer events.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getDistanceBearingData,
  subscribeDistanceBearing,
  type DistanceBearingData,
} from './DistanceBearingLayer';

export function DistanceBearingOverlay() {
  const [data, setData] = useState<DistanceBearingData | null>(null);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragging.current = true;
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const parent = (e.currentTarget as HTMLElement).parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    setPos({
      x: e.clientX - parentRect.left - dragOffset.current.x,
      y: e.clientY - parentRect.top - dragOffset.current.y,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

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

  const style: React.CSSProperties = pos
    ? { position: 'absolute', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {};

  return (
    <div
      className="distance-bearing-overlay"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Directional arrow pointing from chaser toward storm */}
      <div className="distance-bearing-arrow" style={{ transform: `rotate(${bearing}deg)` }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Upward-pointing arrow (0° = North / up) */}
          <path
            d="M24 4L34 22H28V42H20V22H14L24 4Z"
            fill="#ffffff"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="1"
          />
        </svg>
      </div>
      <div className="distance-bearing-distance">
        {dist.toFixed(1)}
        <span className="distance-bearing-unit">mi</span>
      </div>
      <div className="distance-bearing-label">Chaser → Storm</div>
    </div>
  );
}
