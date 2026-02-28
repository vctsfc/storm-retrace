import { EventPicker } from '../sidebar/EventPicker';
import { ProductSelector } from '../sidebar/ProductSelector';
import { PaletteSelector } from '../sidebar/PaletteSelector';
import { ElevationSelector } from '../sidebar/ElevationSelector';
import { BaseMapSwitcher } from '../sidebar/BaseMapSwitcher';
import { LayerToggles } from '../sidebar/LayerToggles';
import { GPXImport } from '../sidebar/GPXImport';
import { ExportPanel } from '../sidebar/ExportPanel';
import { StormPathControls } from '../sidebar/StormPathControls';
import { CollapsibleSection } from '../sidebar/CollapsibleSection';
import { ServerInfoDialog } from '../sidebar/ServerInfoDialog';
import { useRadarStore } from '../../stores/radarStore';
import '../../styles/sidebar.css';

/**
 * Left sidebar containing all control panels.
 *
 * Grouped into collapsible sections to manage the growing set of controls.
 */
export function Sidebar() {
  const radarSmoothing = useRadarStore((s) => s.radarSmoothing);
  const setRadarSmoothing = useRadarStore((s) => s.setRadarSmoothing);
  const forceRerender = useRadarStore((s) => s.forceRerender);
  const scanFiles = useRadarStore((s) => s.scanFiles);

  return (
    <div className="sidebar">
      {/* Event setup: date/time, site, and chase track import */}
      <CollapsibleSection title="Event" storageKey="event">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <EventPicker />
          <GPXImport />
        </div>
      </CollapsibleSection>

      {/* Radar controls + storm path drawing */}
      <CollapsibleSection title="Radar" storageKey="radar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ProductSelector />
          <PaletteSelector />
          <ElevationSelector />
          <StormPathControls />
          <div className="smoothing-row" style={{ marginTop: 4 }}>
            <label className="smoothing-label">Smoothing</label>
            <select
              className="smoothing-select"
              value={radarSmoothing}
              onChange={(e) => setRadarSmoothing(e.target.value as any)}
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </select>
          </div>
          {scanFiles.length > 0 && (
            <button
              className="rerender-btn"
              onClick={forceRerender}
              title="Clear cached frames and re-render with current settings"
            >
              ↻ Re-render radar
            </button>
          )}
        </div>
      </CollapsibleSection>

      <LayerToggles />
      <ExportPanel />
      <BaseMapSwitcher />

      {/* Keyboard shortcuts reference */}
      <CollapsibleSection title="Shortcuts" storageKey="shortcuts" defaultOpen={false}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <div><kbd>Space</kbd> Play/Pause</div>
          <div><kbd>←</kbd> / <kbd>→</kbd> Step frame</div>
          <div><kbd>Shift+←/→</kbd> Step 5 frames</div>
          <div><kbd>[</kbd> / <kbd>]</kbd> Set loop points</div>
          <div><kbd>L</kbd> Toggle loop</div>
          <div><kbd>1-5</kbd> Speed (1x-16x)</div>
          <div><kbd>R</kbd> REF / <kbd>V</kbd> VEL</div>
        </div>
      </CollapsibleSection>

      <ServerInfoDialog />
    </div>
  );
}
