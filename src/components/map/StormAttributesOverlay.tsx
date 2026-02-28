/**
 * Storm Attributes floating overlay.
 *
 * Displays computed radar statistics for the current frame:
 * VCP, max reflectivity, gate counts above severe thresholds,
 * max inbound/outbound velocity. Updates each frame as the
 * RadarLayer pushes stats to radarStore.
 */

import { useRadarStore } from '../../stores/radarStore';

export function StormAttributesOverlay() {
  const stats = useRadarStore((s) => s.currentFrameStats);
  const scanFiles = useRadarStore((s) => s.scanFiles);

  if (!stats || scanFiles.length === 0) return null;

  const maxRefStr = stats.maxRef !== null ? `${stats.maxRef.toFixed(1)} dBZ` : '—';
  const maxInStr = stats.maxInboundVel !== null ? `${stats.maxInboundVel.toFixed(1)} kts` : '—';
  const maxOutStr = stats.maxOutboundVel !== null ? `${stats.maxOutboundVel.toFixed(1)} kts` : '—';

  return (
    <div className="storm-attrs-overlay">
      <div className="storm-attrs-title">Storm Attributes</div>
      <div className="storm-attrs-grid">
        <span className="storm-attrs-label">VCP</span>
        <span className="storm-attrs-value">{stats.vcp || '—'}</span>

        <span className="storm-attrs-label">Max REF</span>
        <span className="storm-attrs-value storm-attrs-ref">{maxRefStr}</span>

        <span className="storm-attrs-label">Gates 50+</span>
        <span className="storm-attrs-value">{stats.gatesAbove50.toLocaleString()}</span>

        <span className="storm-attrs-label">Gates 60+</span>
        <span className="storm-attrs-value storm-attrs-severe">{stats.gatesAbove60.toLocaleString()}</span>

        <span className="storm-attrs-label">Max In</span>
        <span className="storm-attrs-value storm-attrs-vel-in">{maxInStr}</span>

        <span className="storm-attrs-label">Max Out</span>
        <span className="storm-attrs-value storm-attrs-vel-out">{maxOutStr}</span>
      </div>
    </div>
  );
}
