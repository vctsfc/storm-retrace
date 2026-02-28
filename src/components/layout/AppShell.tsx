import { useState, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import { Sidebar } from './Sidebar';
import { TimelineBar } from './TimelineBar';
import { MapContainer } from '../map/MapContainer';
import { MapProvider } from '../map/MapContext';
import { OutlooksLayer } from '../map/OutlooksLayer';
import { RadarLayer } from '../map/RadarLayer';
import { WatchesLayer } from '../map/WatchesLayer';
import { WarningsLayer } from '../map/WarningsLayer';
import { MCDLayer } from '../map/MCDLayer';
import { LSRLayer } from '../map/LSRLayer';
import { SurfaceObsLayer } from '../map/SurfaceObsLayer';
import { ChaseTrackLayer } from '../map/ChaseTrackLayer';
import { StormPathLayer } from '../map/StormPathLayer';
import { SitePickerLayer } from '../map/SitePickerLayer';
import { MoreLabelsLayer } from '../map/MoreLabelsLayer';
import { RadarLegend } from '../map/RadarLegend';
import { StormAttributesOverlay } from '../map/StormAttributesOverlay';
import { DistanceBearingLayer } from '../map/DistanceBearingLayer';
import { DistanceBearingOverlay } from '../map/DistanceBearingOverlay';
import { TornadoTracksLayer } from '../map/TornadoTracksLayer';
import { TitleBar } from './TitleBar';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useRadarPlayback } from '../../hooks/useRadarPlayback';
import { useTimeSyncedOverlays } from '../../hooks/useTimeSyncedOverlays';
import { useRadarStore } from '../../stores/radarStore';

/**
 * Top-level application layout: sidebar + map + timeline bar.
 *
 * MapProvider is lifted here so the Sidebar (ExportPanel) can also
 * access the map instance via useMap().
 */
export function AppShell() {
  // Activate keyboard shortcuts, playback loop, and overlay fetching
  useKeyboardShortcuts();
  useRadarPlayback();
  useTimeSyncedOverlays();

  const loading = useRadarStore((s) => s.loading);

  // Map instance lifted to AppShell so both Sidebar and MapContainer
  // children can access it via the shared MapProvider.
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const handleMapReady = useCallback((m: maplibregl.Map | null) => setMap(m), []);

  return (
    <MapProvider value={map}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
      }}>
        <TitleBar />
        <div style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
        }}>
          <Sidebar />
          <MapContainer onMapReady={handleMapReady}>
            <OutlooksLayer />
            <RadarLayer />
            <TornadoTracksLayer />
            <WatchesLayer />
            <WarningsLayer />
            <MCDLayer />
            <LSRLayer />
            <SurfaceObsLayer />
            <ChaseTrackLayer />
            <StormPathLayer />
            <SitePickerLayer />
            <MoreLabelsLayer />
            <DistanceBearingLayer />
            <RadarLegend />
            <StormAttributesOverlay />
            <DistanceBearingOverlay />
            {loading && (
              <div className="map-loading-overlay">
                <div className="spinner" />
                <span>Loading radar data...</span>
              </div>
            )}
          </MapContainer>
        </div>
        <TimelineBar />
      </div>
    </MapProvider>
  );
}
