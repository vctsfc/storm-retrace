/**
 * Segment editor for multi-site radar handoff.
 *
 * Shows ordered list of radar segments when scans are loaded.
 * Allows adding handoff sites, editing handoff times, and removing segments.
 * Triggers a full multi-site reload when segments change.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRadarStore, type NexradSite, type RadarSegment } from '../../stores/radarStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { loadSegments } from './EventPicker';
import { formatLocalTime, getTimezoneAbbr } from '../../utils/time';
import { getPublicAssetUrl } from '../../utils/baseUrl';

interface StationFeature {
  properties: { id: string; name: string; elevation: number; tz?: string };
  geometry: { coordinates: [number, number] };
}

let stationsCache: StationFeature[] | null = null;

export function SegmentEditor() {
  const segments = useRadarStore((s) => s.segments);
  const scanFiles = useRadarStore((s) => s.scanFiles);
  const selectedSite = useRadarStore((s) => s.selectedSite);
  const loading = useRadarStore((s) => s.loading);
  const frameTimes = useTimelineStore((s) => s.frameTimes);

  const [adding, setAdding] = useState(false);
  const [siteQuery, setSiteQuery] = useState('');
  const [stations, setStations] = useState<StationFeature[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [editingBoundary, setEditingBoundary] = useState<number | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Load stations once
  useEffect(() => {
    if (stationsCache) {
      setStations(stationsCache);
      return;
    }
    fetch(getPublicAssetUrl('nexrad-stations.geojson'))
      .then((r) => r.json())
      .then((geojson) => {
        stationsCache = geojson.features;
        setStations(geojson.features);
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!adding) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [adding]);

  const filteredStations = siteQuery.length > 0
    ? stations
        .filter((s) => {
          const q = siteQuery.toUpperCase();
          return s.properties.id.includes(q) || s.properties.name.toUpperCase().includes(q);
        })
        // Exclude sites already in segments
        .filter((s) => !segments.some((seg) => seg.site.id === s.properties.id))
        .slice(0, 8)
    : [];

  // Compute the full event time range from frameTimes
  const eventStartMs = frameTimes.length > 0 ? frameTimes[0] : 0;
  const eventEndMs = frameTimes.length > 0 ? frameTimes[frameTimes.length - 1] : 0;

  const handleAddSite = useCallback((station: StationFeature) => {
    const newSite: NexradSite = {
      id: station.properties.id,
      name: station.properties.name,
      lat: station.geometry.coordinates[1],
      lon: station.geometry.coordinates[0],
      elevation: station.properties.elevation,
      tz: station.properties.tz || 'UTC',
    };

    const store = useRadarStore.getState();
    const currentSegments = store.segments;
    const currentSite = store.selectedSite;

    let newSegments: RadarSegment[];

    if (currentSegments.length === 0 && currentSite) {
      // First handoff: split current single-site event into two segments
      const midpoint = eventStartMs + (eventEndMs - eventStartMs) / 2;
      newSegments = [
        {
          id: crypto.randomUUID(),
          site: currentSite,
          startMs: eventStartMs,
          endMs: midpoint,
        },
        {
          id: crypto.randomUUID(),
          site: newSite,
          startMs: midpoint,
          endMs: eventEndMs,
        },
      ];
    } else {
      // Add to existing segments: split the last segment
      const last = currentSegments[currentSegments.length - 1];
      const midpoint = last.startMs + (last.endMs - last.startMs) / 2;
      newSegments = [
        ...currentSegments.slice(0, -1),
        { ...last, endMs: midpoint },
        {
          id: crypto.randomUUID(),
          site: newSite,
          startMs: midpoint,
          endMs: last.endMs,
        },
      ];
    }

    setAdding(false);
    setSiteQuery('');
    setShowResults(false);
    loadSegments(newSegments);
  }, [eventStartMs, eventEndMs]);

  const handleRemoveSegment = useCallback((segId: string) => {
    const store = useRadarStore.getState();
    const current = store.segments;
    if (current.length <= 2) {
      // Removing one of two segments returns to single-site mode
      const remaining = current.find((s) => s.id !== segId);
      if (remaining) {
        store.setSegments([]);
        store.setSelectedSite(remaining.site);
        // Trigger single-site reload via the EventPicker's existing handleLoad
        // by dispatching a custom event
        window.dispatchEvent(new CustomEvent('segment-reload-single', { detail: remaining }));
      }
      return;
    }
    // 3+ segments: merge the removed segment's time range into its neighbor
    const idx = current.findIndex((s) => s.id === segId);
    const newSegments = current.filter((s) => s.id !== segId);
    if (idx > 0) {
      // Expand previous segment to cover removed range
      newSegments[idx - 1] = { ...newSegments[idx - 1], endMs: current[idx].endMs };
    } else {
      // Removed first segment: expand next to cover
      newSegments[0] = { ...newSegments[0], startMs: current[idx].startMs };
    }
    loadSegments(newSegments);
  }, []);

  const handleBoundaryChange = useCallback((segIndex: number, newTimeStr: string) => {
    const store = useRadarStore.getState();
    const current = store.segments;
    if (segIndex >= current.length - 1) return;

    // Parse the new time — it's in the format HH:MM relative to the event date
    const seg = current[segIndex];
    const tz = seg.site.tz || 'UTC';
    // Create a date from the segment's start, then override hours/minutes
    const baseDate = new Date(seg.startMs);
    const [hours, minutes] = newTimeStr.split(':').map(Number);

    // Use the base date in the segment's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = formatter.formatToParts(baseDate);
    const year = parts.find((p) => p.type === 'year')!.value;
    const month = parts.find((p) => p.type === 'month')!.value;
    const day = parts.find((p) => p.type === 'day')!.value;

    // Build an ISO string and parse it in the target timezone
    const isoStr = `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    // Use a temporary date to get UTC offset
    const tempDate = new Date(isoStr + 'Z');
    // Approximate: compute the timezone offset
    const localStr = tempDate.toLocaleString('en-US', { timeZone: tz });
    const localDate = new Date(localStr);
    const offsetMs = tempDate.getTime() - localDate.getTime();
    const newBoundaryMs = tempDate.getTime() + offsetMs;

    // Validate: must be between seg start and next seg end
    const nextSeg = current[segIndex + 1];
    if (newBoundaryMs <= seg.startMs || newBoundaryMs >= nextSeg.endMs) return;

    const newSegments = [...current];
    newSegments[segIndex] = { ...newSegments[segIndex], endMs: newBoundaryMs };
    newSegments[segIndex + 1] = { ...newSegments[segIndex + 1], startMs: newBoundaryMs };

    setEditingBoundary(null);
    loadSegments(newSegments);
  }, []);

  // Only show when scans are loaded
  if (scanFiles.length === 0) return null;

  // Format a timestamp for display
  const fmtTime = (ms: number, tz: string) =>
    `${formatLocalTime(ms, tz)} ${getTimezoneAbbr(ms, tz)}`;

  return (
    <div className="segment-editor">
      {segments.length > 0 && (
        <div className="segment-list">
          {segments.map((seg, i) => (
            <div key={seg.id} className="segment-row">
              <div className="segment-info">
                <span className="segment-site-id">{seg.site.id}</span>
                <span className="segment-site-name">{seg.site.name}</span>
              </div>
              <div className="segment-time-range">
                {fmtTime(seg.startMs, seg.site.tz)}
                {' — '}
                {fmtTime(seg.endMs, seg.site.tz)}
              </div>
              {segments.length > 1 && (
                <button
                  className="segment-remove-btn"
                  onClick={() => handleRemoveSegment(seg.id)}
                  title={`Remove ${seg.site.id}`}
                  disabled={loading}
                >
                  ×
                </button>
              )}
              {/* Editable boundary between this and next segment */}
              {i < segments.length - 1 && (
                <div className="segment-boundary">
                  {editingBoundary === i ? (
                    <input
                      type="time"
                      className="segment-boundary-input"
                      defaultValue={new Date(seg.endMs).toLocaleTimeString('en-GB', {
                        timeZone: seg.site.tz,
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      onBlur={(e) => handleBoundaryChange(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBoundaryChange(i, (e.target as HTMLInputElement).value);
                        if (e.key === 'Escape') setEditingBoundary(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      className="segment-boundary-btn"
                      onClick={() => setEditingBoundary(i)}
                      title="Edit handoff time"
                    >
                      ▸ Handoff at{' '}
                      {formatLocalTime(seg.endMs, seg.site.tz)}{' '}
                      {getTimezoneAbbr(seg.endMs, seg.site.tz)}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="segment-add-form" ref={searchRef}>
          <input
            type="text"
            className="segment-site-search"
            placeholder="Search site ID or city..."
            value={siteQuery}
            onChange={(e) => {
              setSiteQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            autoFocus
          />
          {showResults && filteredStations.length > 0 && (
            <div className="segment-search-results">
              {filteredStations.map((s) => (
                <button
                  key={s.properties.id}
                  className="segment-search-result"
                  onClick={() => handleAddSite(s)}
                >
                  <strong>{s.properties.id}</strong>{' '}
                  <span>{s.properties.name}</span>
                </button>
              ))}
            </div>
          )}
          <button
            className="segment-cancel-btn"
            onClick={() => { setAdding(false); setSiteQuery(''); }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="add-handoff-btn"
          onClick={() => setAdding(true)}
          disabled={loading}
        >
          + Add Handoff Site
        </button>
      )}
    </div>
  );
}
