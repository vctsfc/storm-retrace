import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore, BASE_MAP_STYLES } from '../../stores/mapStore';
import { MapProvider } from './MapContext';
import '../../styles/map.css';

interface MapContainerProps {
  children?: React.ReactNode;
  onMapReady?: (map: maplibregl.Map | null) => void;
}

/**
 * Core map component that initializes MapLibre GL and manages the map instance.
 * Provides the map to children via React context.
 */
export function MapContainer({ children, onMapReady }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState<maplibregl.Map | null>(null);

  const baseMapStyle = useMapStore((s) => s.baseMapStyle);

  useEffect(() => {
    if (!containerRef.current) return;

    // Track whether this effect has been cleaned up (StrictMode fires cleanup
    // between the double-mount cycle, but the async 'load' callback from the
    // first map may still fire after cleanup).
    let cancelled = false;

    const { center, zoom } = useMapStore.getState();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_MAP_STYLES[baseMapStyle],
      center: center,
      zoom: zoom,
      attributionControl: false,
      preserveDrawingBuffer: true, // Required for canvas capture (export/screenshot)
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-right');

    map.on('error', (e) => {
      console.warn('[MapContainer] map error:', e.error?.message || e.error || e);
    });

    map.on('load', () => {
      if (cancelled) {
        console.log('[MapContainer] load fired on destroyed map — ignoring');
        return;
      }
      console.log('[MapContainer] map load event fired');
      map.resize();
      mapRef.current = map;
      // Debug: expose on window for console inspection
      (window as any).__stormReplayMap = map;
      setMapReady(map);
      onMapReady?.(map);
    });

    // Sync map movements back to store
    map.on('moveend', () => {
      if (cancelled) return;
      const c = map.getCenter();
      useMapStore.getState().setCenter([c.lng, c.lat]);
      useMapStore.getState().setZoom(map.getZoom());
    });

    return () => {
      console.log('[MapContainer] cleanup — removing map');
      cancelled = true;
      map.remove();
      mapRef.current = null;
      setMapReady(null);
      onMapReady?.(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update map style when baseMapStyle changes (without recreating the map)
  const initialStyleRef = useRef(true);
  useEffect(() => {
    if (initialStyleRef.current) {
      initialStyleRef.current = false;
      return;
    }

    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    map.setStyle(BASE_MAP_STYLES[baseMapStyle]);
  }, [baseMapStyle]);

  return (
    <div className="map-container">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <MapProvider value={mapReady}>
        {children}
      </MapProvider>
    </div>
  );
}
