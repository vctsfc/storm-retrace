import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContext';
import { useRadarStore, type NexradSite } from '../../stores/radarStore';
import { getPublicAssetUrl } from '../../utils/baseUrl';
import { isMapUsable } from '../../utils/mapSafety';

const SITES_SOURCE_ID = 'nexrad-sites';
const SITES_LAYER_ID = 'nexrad-sites-layer';
const SITES_LABEL_LAYER_ID = 'nexrad-sites-labels';

/** Cached GeoJSON so style-change re-adds don't re-fetch. */
let cachedStationsGeoJSON: GeoJSON.FeatureCollection | null = null;

/**
 * Renders NEXRAD site markers on the map and handles click-to-select.
 * Loads the stations GeoJSON from /nexrad-stations.geojson.
 */
export function SitePickerLayer() {
  const map = useMap();
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const addedRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    // Cancelled flag prevents stale async work from modifying the map
    // after cleanup (e.g. HMR remount or map removal).
    let cancelled = false;

    // Reset on new map instance (e.g. style change or remount)
    addedRef.current = false;

    /**
     * Add site source + layers to the map.
     * NOTE: We intentionally do NOT gate on map.isStyleLoaded().
     * The map is provided via context only after the 'load' event, so a
     * style exists. Other overlay layers adding GeoJSON sources can cause
     * isStyleLoaded() to temporarily return false while MapLibre processes
     * their data, but addSource/addLayer still work fine in that state.
     */
    const addLayers = async () => {
      if (addedRef.current || cancelled) return;

      // Already present (e.g. from a concurrent call)
      if (map.getSource(SITES_SOURCE_ID)) {
        addedRef.current = true;
        return;
      }

      try {
        // Use cached GeoJSON if available (avoids re-fetch on style changes)
        let geojson = cachedStationsGeoJSON;
        if (!geojson) {
          const response = await fetch(getPublicAssetUrl('nexrad-stations.geojson'));
          geojson = await response.json();
          cachedStationsGeoJSON = geojson;
        }

        // Guard: cancelled during async fetch
        if (cancelled) return;

        // Guard: source added by concurrent call while we were fetching
        if (map.getSource(SITES_SOURCE_ID)) {
          addedRef.current = true;
          return;
        }

        map.addSource(SITES_SOURCE_ID, {
          type: 'geojson',
          data: geojson!,
        });

        // Site marker dots
        map.addLayer({
          id: SITES_LAYER_ID,
          type: 'circle',
          source: SITES_SOURCE_ID,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 6, 6, 10, 8],
            'circle-color': '#58a6ff',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#0d1117',
            'circle-opacity': 0.8,
          },
        });

        // Site ID labels (CARTO basemap provides Open Sans glyphs)
        map.addLayer({
          id: SITES_LABEL_LAYER_ID,
          type: 'symbol',
          source: SITES_SOURCE_ID,
          layout: {
            'text-field': ['get', 'id'],
            'text-size': 10,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-font': ['Open Sans Regular', 'Noto Sans Regular'],
          },
          paint: {
            'text-color': '#8b949e',
            'text-halo-color': '#0d1117',
            'text-halo-width': 1,
          },
          minzoom: 6,
        });

        addedRef.current = true;
        console.log('[SitePickerLayer] NEXRAD stations added to map');
      } catch (err) {
        console.error('[SitePickerLayer] Failed to load NEXRAD stations:', err);
      }
    };

    // Click handler for site selection
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const props = feature.properties;
      if (!props) return;

      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

      const site: NexradSite = {
        id: props.id,
        name: props.name || props.id,
        lat: coords[1],
        lon: coords[0],
        elevation: props.elevation || 0,
        tz: props.tz || 'UTC',
      };

      // Close existing popup
      popupRef.current?.remove();

      // Show popup with site info and select button
      const popup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '200px' })
        .setLngLat(coords)
        .setHTML(`
          <div class="site-popup">
            <div class="site-id">${site.id}</div>
            <div class="site-name">${site.name}</div>
            <button class="site-select-btn" id="select-site-btn">Select Site</button>
          </div>
        `)
        .addTo(map);

      popupRef.current = popup;

      // Wire up the select button after popup is added to DOM
      setTimeout(() => {
        const btn = document.getElementById('select-site-btn');
        btn?.addEventListener('click', () => {
          useRadarStore.getState().setSelectedSite(site);
          popup.remove();
        });
      }, 0);
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    // Re-add layers when style changes (MapLibre removes all sources/layers on style swap)
    const onStyleLoad = () => {
      addedRef.current = false;
      addLayers();
    };

    // Bind click/hover events once the layer exists
    const bindEvents = () => {
      if (!isMapUsable(map)) return;
      if (map.getLayer(SITES_LAYER_ID)) {
        map.on('click', SITES_LAYER_ID, onClick);
        map.on('mouseenter', SITES_LAYER_ID, onMouseEnter);
        map.on('mouseleave', SITES_LAYER_ID, onMouseLeave);
      }
    };

    addLayers();
    map.on('style.load', onStyleLoad);

    // Try binding immediately and also on sourcedata (layer may not exist yet due to async fetch)
    bindEvents();
    map.on('sourcedata', bindEvents);

    return () => {
      cancelled = true;
      try {
        map.off('style.load', onStyleLoad);
        map.off('sourcedata', bindEvents);
        if (map.getLayer(SITES_LAYER_ID)) {
          map.off('click', SITES_LAYER_ID, onClick);
          map.off('mouseenter', SITES_LAYER_ID, onMouseEnter);
          map.off('mouseleave', SITES_LAYER_ID, onMouseLeave);
        }
      } catch { /* map destroyed */ }
      popupRef.current?.remove();
    };
  }, [map]);

  return null;
}
