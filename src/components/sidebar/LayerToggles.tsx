import { useOverlayStore } from '../../stores/overlayStore';
import { useRadarStore } from '../../stores/radarStore';
import { useTrackStore } from '../../stores/trackStore';
import { useStormPathStore } from '../../stores/stormPathStore';
import { CollapsibleSection } from './CollapsibleSection';

function OpacitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="opacity-slider-row">
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="opacity-slider"
      />
      <span className="opacity-value">{Math.round(value * 100)}%</span>
    </div>
  );
}

/**
 * Sidebar section with toggles and opacity sliders for overlay layers.
 * Order: Radar opacity -> Outlooks -> Watches -> Warnings -> MDs -> LSRs
 */
export function LayerToggles() {
  // ── Radar ──
  const radarOpacity = useRadarStore((s) => s.radarOpacity);
  const setRadarOpacity = useRadarStore((s) => s.setRadarOpacity);
  const showStormAttributes = useRadarStore((s) => s.showStormAttributes);
  const setShowStormAttributes = useRadarStore((s) => s.setShowStormAttributes);

  // ── Outlooks ──
  const outlooksVisible = useOverlayStore((s) => s.outlooksVisible);
  const outlooksLoading = useOverlayStore((s) => s.outlooksLoading);
  const outlooksError = useOverlayStore((s) => s.outlooksError);
  const outlooksCount = useOverlayStore((s) => s.outlooks.length);
  const outlooksOpacity = useOverlayStore((s) => s.outlooksOpacity);
  const setOutlooksVisible = useOverlayStore((s) => s.setOutlooksVisible);
  const setOutlooksOpacity = useOverlayStore((s) => s.setOutlooksOpacity);

  // ── Watches ──
  const watchesVisible = useOverlayStore((s) => s.watchesVisible);
  const watchesTimeSynced = useOverlayStore((s) => s.watchesTimeSynced);
  const watchesLoading = useOverlayStore((s) => s.watchesLoading);
  const watchesError = useOverlayStore((s) => s.watchesError);
  const watchesCount = useOverlayStore((s) => s.watches.length);
  const watchesOpacity = useOverlayStore((s) => s.watchesOpacity);
  const setWatchesVisible = useOverlayStore((s) => s.setWatchesVisible);
  const setWatchesTimeSynced = useOverlayStore((s) => s.setWatchesTimeSynced);
  const setWatchesOpacity = useOverlayStore((s) => s.setWatchesOpacity);

  // ── Warnings ──
  const warningsVisible = useOverlayStore((s) => s.warningsVisible);
  const warningsTimeSynced = useOverlayStore((s) => s.warningsTimeSynced);
  const warningsLoading = useOverlayStore((s) => s.warningsLoading);
  const warningsError = useOverlayStore((s) => s.warningsError);
  const warningsCount = useOverlayStore((s) => s.warnings.length);
  const warningsOpacity = useOverlayStore((s) => s.warningsOpacity);
  const setWarningsVisible = useOverlayStore((s) => s.setWarningsVisible);
  const setWarningsTimeSynced = useOverlayStore((s) => s.setWarningsTimeSynced);
  const setWarningsOpacity = useOverlayStore((s) => s.setWarningsOpacity);

  // ── MCDs ──
  const mcdsVisible = useOverlayStore((s) => s.mcdsVisible);
  const mcdsTimeSynced = useOverlayStore((s) => s.mcdsTimeSynced);
  const mcdsLoading = useOverlayStore((s) => s.mcdsLoading);
  const mcdsError = useOverlayStore((s) => s.mcdsError);
  const mcdsCount = useOverlayStore((s) => s.mcds.length);
  const mcdsOpacity = useOverlayStore((s) => s.mcdsOpacity);
  const setMCDsVisible = useOverlayStore((s) => s.setMCDsVisible);
  const setMCDsTimeSynced = useOverlayStore((s) => s.setMCDsTimeSynced);
  const setMCDsOpacity = useOverlayStore((s) => s.setMCDsOpacity);

  // ── LSRs ──
  const lsrsVisible = useOverlayStore((s) => s.lsrsVisible);
  const lsrsTimeSynced = useOverlayStore((s) => s.lsrsTimeSynced);
  const lsrsLoading = useOverlayStore((s) => s.lsrsLoading);
  const lsrsError = useOverlayStore((s) => s.lsrsError);
  const lsrsCount = useOverlayStore((s) => s.lsrs.length);
  const lsrsOpacity = useOverlayStore((s) => s.lsrsOpacity);
  const setLSRsVisible = useOverlayStore((s) => s.setLSRsVisible);
  const setLSRsTimeSynced = useOverlayStore((s) => s.setLSRsTimeSynced);
  const setLSRsOpacity = useOverlayStore((s) => s.setLSRsOpacity);

  // ── Surface Obs ──
  const surfaceObsVisible = useOverlayStore((s) => s.surfaceObsVisible);
  const surfaceObsTimeSynced = useOverlayStore((s) => s.surfaceObsTimeSynced);
  const surfaceObsLoading = useOverlayStore((s) => s.surfaceObsLoading);
  const surfaceObsError = useOverlayStore((s) => s.surfaceObsError);
  const surfaceObsCount = useOverlayStore((s) => s.surfaceObs.length);
  const surfaceObsOpacity = useOverlayStore((s) => s.surfaceObsOpacity);
  const setSurfaceObsVisible = useOverlayStore((s) => s.setSurfaceObsVisible);
  const setSurfaceObsTimeSynced = useOverlayStore((s) => s.setSurfaceObsTimeSynced);
  const setSurfaceObsOpacity = useOverlayStore((s) => s.setSurfaceObsOpacity);

  // ── Chase Tracks ──
  const tracksCount = useTrackStore((s) => s.tracks.length);
  const tracksVisible = useTrackStore((s) => s.tracksVisible);
  const tracksOpacity = useTrackStore((s) => s.tracksOpacity);
  const showTrail = useTrackStore((s) => s.showTrail);
  const followTrack = useTrackStore((s) => s.followTrack);
  const setTracksVisible = useTrackStore((s) => s.setTracksVisible);
  const setTracksOpacity = useTrackStore((s) => s.setTracksOpacity);
  const setShowTrail = useTrackStore((s) => s.setShowTrail);
  const setFollowTrack = useTrackStore((s) => s.setFollowTrack);

  // ── Storm Path (for mutual exclusivity with follow chaser) ──
  const followStorm = useStormPathStore((s) => s.followStorm);
  const setFollowStorm = useStormPathStore((s) => s.setFollowStorm);

  return (
    <CollapsibleSection title="Layers" storageKey="layers">
      <div className="layer-toggles">

        {/* ── Radar Opacity ── */}
        <div className="layer-toggle-group">
          <div className="layer-toggle-header">
            <span className="layer-toggle-label" style={{ fontSize: 12 }}>Radar</span>
            <OpacitySlider value={radarOpacity} onChange={setRadarOpacity} />
          </div>
          <label className="layer-toggle-row sub-toggle">
            <input
              type="checkbox"
              checked={showStormAttributes}
              onChange={(e) => setShowStormAttributes(e.target.checked)}
            />
            <span className="layer-toggle-label">Storm attributes</span>
          </label>
        </div>

        {/* ── Outlooks ── */}
        <div className="layer-toggle-group">
          <div className="layer-toggle-header">
            <label className="layer-toggle-row">
              <input
                type="checkbox"
                checked={outlooksVisible}
                onChange={(e) => setOutlooksVisible(e.target.checked)}
              />
              <span className="layer-toggle-label">
                Outlooks
                {outlooksLoading && <span className="layer-badge loading">...</span>}
                {!outlooksLoading && outlooksCount > 0 && (
                  <span className="layer-badge count">{outlooksCount}</span>
                )}
              </span>
            </label>
            {outlooksVisible && (
              <OpacitySlider value={outlooksOpacity} onChange={setOutlooksOpacity} />
            )}
          </div>
          {outlooksError && <div className="error-message">{outlooksError}</div>}
        </div>

        {/* ── Watches ── */}
        <div className="layer-toggle-group">
          <div className="layer-toggle-header">
            <label className="layer-toggle-row">
              <input
                type="checkbox"
                checked={watchesVisible}
                onChange={(e) => setWatchesVisible(e.target.checked)}
              />
              <span className="layer-toggle-label">
                Watches
                {watchesLoading && <span className="layer-badge loading">...</span>}
                {!watchesLoading && watchesCount > 0 && (
                  <span className="layer-badge count">{watchesCount}</span>
                )}
              </span>
            </label>
            {watchesVisible && (
              <OpacitySlider value={watchesOpacity} onChange={setWatchesOpacity} />
            )}
          </div>
          {watchesVisible && (
            <label className="layer-toggle-row sub-toggle">
              <input
                type="checkbox"
                checked={watchesTimeSynced}
                onChange={(e) => setWatchesTimeSynced(e.target.checked)}
              />
              <span className="layer-toggle-label">Time-synced</span>
            </label>
          )}
          {watchesError && <div className="error-message">{watchesError}</div>}
        </div>

        {/* ── Warnings ── */}
        <div className="layer-toggle-group">
          <div className="layer-toggle-header">
            <label className="layer-toggle-row">
              <input
                type="checkbox"
                checked={warningsVisible}
                onChange={(e) => setWarningsVisible(e.target.checked)}
              />
              <span className="layer-toggle-label">
                Warnings
                {warningsLoading && <span className="layer-badge loading">...</span>}
                {!warningsLoading && warningsCount > 0 && (
                  <span className="layer-badge count">{warningsCount}</span>
                )}
              </span>
            </label>
            {warningsVisible && (
              <OpacitySlider value={warningsOpacity} onChange={setWarningsOpacity} />
            )}
          </div>
          {warningsVisible && (
            <label className="layer-toggle-row sub-toggle">
              <input
                type="checkbox"
                checked={warningsTimeSynced}
                onChange={(e) => setWarningsTimeSynced(e.target.checked)}
              />
              <span className="layer-toggle-label">Time-synced</span>
            </label>
          )}
          {warningsError && <div className="error-message">{warningsError}</div>}
        </div>

        {/* ── MCDs ── */}
        <div className="layer-toggle-group">
          <div className="layer-toggle-header">
            <label className="layer-toggle-row">
              <input
                type="checkbox"
                checked={mcdsVisible}
                onChange={(e) => setMCDsVisible(e.target.checked)}
              />
              <span className="layer-toggle-label">
                MDs
                {mcdsLoading && <span className="layer-badge loading">...</span>}
                {!mcdsLoading && mcdsCount > 0 && (
                  <span className="layer-badge count">{mcdsCount}</span>
                )}
              </span>
            </label>
            {mcdsVisible && (
              <OpacitySlider value={mcdsOpacity} onChange={setMCDsOpacity} />
            )}
          </div>
          {mcdsVisible && (
            <label className="layer-toggle-row sub-toggle">
              <input
                type="checkbox"
                checked={mcdsTimeSynced}
                onChange={(e) => setMCDsTimeSynced(e.target.checked)}
              />
              <span className="layer-toggle-label">Time-synced</span>
            </label>
          )}
          {mcdsError && <div className="error-message">{mcdsError}</div>}
        </div>

        {/* ── LSRs ── */}
        <div className="layer-toggle-group">
          <div className="layer-toggle-header">
            <label className="layer-toggle-row">
              <input
                type="checkbox"
                checked={lsrsVisible}
                onChange={(e) => setLSRsVisible(e.target.checked)}
              />
              <span className="layer-toggle-label">
                Reports
                {lsrsLoading && <span className="layer-badge loading">...</span>}
                {!lsrsLoading && lsrsCount > 0 && (
                  <span className="layer-badge count">{lsrsCount}</span>
                )}
              </span>
            </label>
            {lsrsVisible && (
              <OpacitySlider value={lsrsOpacity} onChange={setLSRsOpacity} />
            )}
          </div>
          {lsrsVisible && (
            <label className="layer-toggle-row sub-toggle">
              <input
                type="checkbox"
                checked={lsrsTimeSynced}
                onChange={(e) => setLSRsTimeSynced(e.target.checked)}
              />
              <span className="layer-toggle-label">Time-synced</span>
            </label>
          )}
          {lsrsError && <div className="error-message">{lsrsError}</div>}
        </div>

        {/* ── Surface Obs ── */}
        <div className="layer-toggle-group">
          <div className="layer-toggle-header">
            <label className="layer-toggle-row">
              <input
                type="checkbox"
                checked={surfaceObsVisible}
                onChange={(e) => setSurfaceObsVisible(e.target.checked)}
              />
              <span className="layer-toggle-label">
                Sfc Obs
                {surfaceObsLoading && <span className="layer-badge loading">...</span>}
                {!surfaceObsLoading && surfaceObsCount > 0 && (
                  <span className="layer-badge count">{surfaceObsCount}</span>
                )}
              </span>
            </label>
            {surfaceObsVisible && (
              <OpacitySlider value={surfaceObsOpacity} onChange={setSurfaceObsOpacity} />
            )}
          </div>
          {surfaceObsVisible && (
            <label className="layer-toggle-row sub-toggle">
              <input
                type="checkbox"
                checked={surfaceObsTimeSynced}
                onChange={(e) => setSurfaceObsTimeSynced(e.target.checked)}
              />
              <span className="layer-toggle-label">Time-synced</span>
            </label>
          )}
          {surfaceObsError && <div className="error-message">{surfaceObsError}</div>}
        </div>

        {/* ── Chase Tracks ── */}
        {tracksCount > 0 && (
          <div className="layer-toggle-group">
            <div className="layer-toggle-header">
              <label className="layer-toggle-row">
                <input
                  type="checkbox"
                  checked={tracksVisible}
                  onChange={(e) => setTracksVisible(e.target.checked)}
                />
                <span className="layer-toggle-label">
                  Tracks
                  <span className="layer-badge count">{tracksCount}</span>
                </span>
              </label>
              {tracksVisible && (
                <OpacitySlider value={tracksOpacity} onChange={setTracksOpacity} />
              )}
            </div>
            {tracksVisible && (
              <>
                <label className="layer-toggle-row sub-toggle">
                  <input
                    type="checkbox"
                    checked={showTrail}
                    onChange={(e) => setShowTrail(e.target.checked)}
                  />
                  <span className="layer-toggle-label">Show trail</span>
                </label>
                <label className="layer-toggle-row sub-toggle">
                  <input
                    type="checkbox"
                    checked={followTrack}
                    onChange={(e) => {
                      setFollowTrack(e.target.checked);
                      // Mutually exclusive with follow storm
                      if (e.target.checked && followStorm) setFollowStorm(false);
                    }}
                  />
                  <span className="layer-toggle-label">Follow chaser</span>
                </label>
              </>
            )}
          </div>
        )}

      </div>
    </CollapsibleSection>
  );
}
