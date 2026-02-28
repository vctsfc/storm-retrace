/**
 * Storm Attributes floating overlay.
 *
 * Displays computed radar statistics for the current frame:
 * VCP, max reflectivity, gate counts above severe thresholds,
 * max inbound/outbound velocity. Updates each frame as the
 * RadarLayer pushes stats to radarStore.
 *
 * Toggleable via radarStore.showStormAttributes and draggable.
 */

import { useCallback, useRef, useState } from 'react';
import { useRadarStore } from '../../stores/radarStore';

export function StormAttributesOverlay() {
  const stats = useRadarStore((s) => s.currentFrameStats);
  const scanFiles = useRadarStore((s) => s.scanFiles);
  const show = useRadarStore((s) => s.showStormAttributes);

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

  if (!show || !stats || scanFiles.length === 0) return null;

  // Defensive: guard against malformed stats objects
  const maxRef = typeof stats.maxRef === 'number' ? stats.maxRef : null;
  const maxIn = typeof stats.maxInboundVel === 'number' ? stats.maxInboundVel : null;
  const maxOut = typeof stats.maxOutboundVel === 'number' ? stats.maxOutboundVel : null;
  const gates50 = typeof stats.gatesAbove50 === 'number' ? stats.gatesAbove50 : 0;
  const gates60 = typeof stats.gatesAbove60 === 'number' ? stats.gatesAbove60 : 0;

  const maxRefStr = maxRef !== null ? `${maxRef.toFixed(1)} dBZ` : '—';
  const maxInStr = maxIn !== null ? `${maxIn.toFixed(1)} kts` : '—';
  const maxOutStr = maxOut !== null ? `${maxOut.toFixed(1)} kts` : '—';

  const style: React.CSSProperties = pos
    ? { position: 'absolute', left: pos.x, top: pos.y, right: 'auto' }
    : {};

  return (
    <div
      className="storm-attrs-overlay"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="storm-attrs-title">Storm Attributes</div>
      <div className="storm-attrs-grid">
        <span className="storm-attrs-label">VCP</span>
        <span className="storm-attrs-value">{typeof stats.vcp === 'number' ? stats.vcp : '—'}</span>

        <span className="storm-attrs-label">Max REF</span>
        <span className="storm-attrs-value storm-attrs-ref">{maxRefStr}</span>

        <span className="storm-attrs-label">Gates 50+</span>
        <span className="storm-attrs-value">{gates50.toLocaleString()}</span>

        <span className="storm-attrs-label">Gates 60+</span>
        <span className="storm-attrs-value storm-attrs-severe">{gates60.toLocaleString()}</span>

        <span className="storm-attrs-label">Max In</span>
        <span className="storm-attrs-value storm-attrs-vel-in">{maxInStr}</span>

        <span className="storm-attrs-label">Max Out</span>
        <span className="storm-attrs-value storm-attrs-vel-out">{maxOutStr}</span>
      </div>
    </div>
  );
}
