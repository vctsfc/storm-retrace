/**
 * GPX file import UI.
 *
 * Provides two import modes:
 * 1. **Folder browser** (Electron only): Point the app at a folder of GPX files,
 *    browse the list, and click to load. Folder path persists across sessions.
 * 2. **File picker / drag-and-drop** (all environments): Manual file selection.
 *
 * Lists imported tracks with color dots and remove buttons.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useTrackStore, getNextTrackColor } from '../../stores/trackStore';
import { getPublicAssetUrl } from '../../utils/baseUrl';
import { useRadarStore, type NexradSite } from '../../stores/radarStore';
import { parseGPX, type TrackPoint } from '../../services/gps/gpxParser';
import { findNearestSite } from '../../utils/geo';

const GPX_FOLDER_KEY = 'gpx-folder-path';
const isElectron = !!window.electronAPI?.isElectron;

/**
 * Stations cache: loaded once from the stations GeoJSON and reused for
 * nearest-site lookup on GPX import.
 */
let stationsCache: NexradSite[] | null = null;
let stationsLoading = false;

async function loadStations(): Promise<NexradSite[]> {
  if (stationsCache) return stationsCache;
  if (stationsLoading) {
    // Wait for the in-flight fetch
    return new Promise((resolve) => {
      const check = () => {
        if (stationsCache) resolve(stationsCache);
        else setTimeout(check, 50);
      };
      check();
    });
  }
  stationsLoading = true;
  try {
    const res = await fetch(getPublicAssetUrl('nexrad-stations.geojson'));
    const geojson = await res.json();
    stationsCache = geojson.features.map((f: any) => ({
      id: f.properties.id,
      name: f.properties.name,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      elevation: f.properties.elevation ?? 0,
      tz: f.properties.tz || 'UTC',
    }));
    return stationsCache!;
  } catch {
    return [];
  } finally {
    stationsLoading = false;
  }
}

/**
 * Given all track points from a GPX import, derive the event date, start time,
 * and end time in the nearest radar site's local timezone. Also find and select
 * the nearest radar site. Dispatches a custom event so EventPicker can update.
 */
async function autoSetEventFromTrack(allPoints: TrackPoint[]): Promise<void> {
  if (allPoints.length === 0) return;

  const startMs = allPoints[0].time;
  const endMs = allPoints[allPoints.length - 1].time;

  // Find nearest radar site to the track start point
  const stations = await loadStations();
  const nearest = findNearestSite(allPoints[0].lat, allPoints[0].lon, stations);

  // Determine timezone for formatting
  const tz = nearest?.tz || 'UTC';

  // Format date/time in the site's local timezone
  const fmtDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const fmtTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Add 30-minute padding before and after the track
  const paddedStartMs = startMs - 30 * 60 * 1000;
  const paddedEndMs = endMs + 30 * 60 * 1000;

  const date = fmtDate.format(new Date(paddedStartMs)); // YYYY-MM-DD
  const startTime = fmtTime.format(new Date(paddedStartMs)); // HH:MM
  const endTime = fmtTime.format(new Date(paddedEndMs)); // HH:MM

  console.log(
    `[GPX] Auto-setting event: ${date} ${startTime}–${endTime} (${tz})` +
      (nearest ? `, nearest site: ${nearest.id}` : ''),
  );

  // Save to localStorage (same key EventPicker uses)
  try {
    localStorage.setItem(
      'storm-replay-event',
      JSON.stringify({ date, startTime, endTime }),
    );
  } catch { /* ignore */ }

  // Select the nearest radar site
  if (nearest) {
    useRadarStore.getState().setSelectedSite(nearest);

    // Fly map to the site
    const map = (window as any).__stormReplayMap;
    if (map) {
      map.flyTo({ center: [nearest.lon, nearest.lat], zoom: 8, duration: 1000 });
    }
  }

  // Notify EventPicker to re-read from localStorage
  window.dispatchEvent(new CustomEvent('gpx-event-auto-set'));
}

/** Format bytes as human-readable string */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format timestamp as short date string */
function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Truncate a folder path for display */
function truncatePath(p: string, maxLen: number = 30): string {
  if (p.length <= maxLen) return p;
  const parts = p.split('/');
  if (parts.length <= 3) return '...' + p.slice(-maxLen);
  return parts[0] + '/.../' + parts.slice(-2).join('/');
}

export function GPXImport() {
  const tracks = useTrackStore((s) => s.tracks);
  const addTrack = useTrackStore((s) => s.addTrack);
  const removeTrack = useTrackStore((s) => s.removeTrack);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folder browser state (Electron only)
  const [folderPath, setFolderPath] = useState<string | null>(() => {
    try { return localStorage.getItem(GPX_FOLDER_KEY); } catch { return null; }
  });
  const [gpxFiles, setGpxFiles] = useState<GPXFileInfo[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<Set<string>>(new Set());
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  /** Scan the folder for GPX files */
  const refreshFileList = useCallback(async (path: string) => {
    if (!window.electronAPI) return;
    try {
      const files = await window.electronAPI.listGPXFiles(path);
      setGpxFiles(files);
    } catch {
      setGpxFiles([]);
    }
  }, []);

  // On mount, if we have a saved folder path, load the file list
  useEffect(() => {
    if (isElectron && folderPath) {
      refreshFileList(folderPath);
    }
  }, [folderPath, refreshFileList]);

  /** Pick a folder via native dialog */
  const handleSelectFolder = useCallback(async () => {
    if (!window.electronAPI) return;
    const selected = await window.electronAPI.selectGPXFolder();
    if (selected) {
      setFolderPath(selected);
      try { localStorage.setItem(GPX_FOLDER_KEY, selected); } catch { /* ignore */ }
      refreshFileList(selected);
    }
  }, [refreshFileList]);

  /** Process parsed GPX data (shared between folder load and file picker) */
  const processGPXText = useCallback(
    (text: string, fileName: string) => {
      const parsed = parseGPX(text);
      const allPoints: TrackPoint[] = [];

      for (const parsedTrack of parsed) {
        const trackCount = useTrackStore.getState().tracks.length;
        const color = getNextTrackColor(trackCount);
        const name =
          parsedTrack.name ?? fileName.replace(/\.gpx$/i, '') ?? 'Unnamed Track';

        addTrack({
          id: crypto.randomUUID(),
          name,
          color,
          points: parsedTrack.points,
          visible: true,
        });

        allPoints.push(...parsedTrack.points);

        console.log(
          `[GPX] Imported "${name}" — ${parsedTrack.points.length} points, color ${color}`,
        );
      }

      if (allPoints.length > 0) {
        allPoints.sort((a, b) => a.time - b.time);
        autoSetEventFromTrack(allPoints);
      }
    },
    [addTrack],
  );

  /** Load a GPX file from the folder via IPC */
  const handleLoadFile = useCallback(
    async (file: GPXFileInfo) => {
      if (!window.electronAPI) return;
      setError(null);
      setLoadingFile(file.path);
      try {
        const text = await window.electronAPI.readGPXFile(file.path);
        processGPXText(text, file.name);
        setLoadedFiles((prev) => new Set(prev).add(file.path));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to read GPX file';
        setError(msg);
        console.error('[GPX] Read error:', err);
      } finally {
        setLoadingFile(null);
      }
    },
    [processGPXText],
  );

  /** Import a file from the file picker or drag-and-drop */
  const importFile = useCallback(
    (file: File) => {
      setError(null);

      if (!file.name.toLowerCase().endsWith('.gpx')) {
        setError('Only .gpx files are supported');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          processGPXText(reader.result as string, file.name);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to parse GPX file';
          setError(msg);
          console.error('[GPX] Parse error:', err);
        }
      };
      reader.onerror = () => {
        setError('Failed to read file');
      };
      reader.readAsText(file);
    },
    [processGPXText],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      importFile(files[i]);
    }
    // Reset so re-selecting the same file works
    e.target.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      importFile(files[i]);
    }
  };

  return (
    <div className="gpx-import-section">
      {/* ── Folder browser (Electron only) ── */}
      {isElectron && (
        <div className="gpx-folder-section">
          {folderPath ? (
            <>
              <div className="gpx-folder-header">
                <span className="gpx-folder-path" title={folderPath}>
                  {truncatePath(folderPath)}
                </span>
                <button className="gpx-folder-change-btn" onClick={handleSelectFolder}>
                  Change
                </button>
              </div>

              {gpxFiles.length === 0 ? (
                <div className="gpx-folder-empty">No .gpx files found</div>
              ) : (
                <div className="gpx-file-list">
                  {gpxFiles.map((file) => {
                    const isLoaded = loadedFiles.has(file.path);
                    const isLoading = loadingFile === file.path;
                    return (
                      <div
                        key={file.path}
                        className={`gpx-file-item${isLoaded ? ' loaded' : ''}`}
                      >
                        <div className="gpx-file-info">
                          <span className="gpx-file-name" title={file.name}>
                            {file.name.replace(/\.gpx$/i, '')}
                          </span>
                          <span className="gpx-file-meta">
                            {formatSize(file.size)} · {formatDate(file.modified)}
                          </span>
                        </div>
                        <button
                          className="gpx-file-load-btn"
                          onClick={() => handleLoadFile(file)}
                          disabled={isLoading}
                        >
                          {isLoading ? '...' : isLoaded ? '✓' : 'Load'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <button className="gpx-folder-btn" onClick={handleSelectFolder}>
              Set GPX Folder
            </button>
          )}
        </div>
      )}

      {/* ── File picker / drag-and-drop (always available) ── */}
      <div
        className={`gpx-drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <button
          className="gpx-import-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Import GPX
        </button>
        <span className="gpx-drop-hint">or drop file here</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx,.GPX"
          multiple
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      {tracks.length > 0 && (
        <div className="gpx-track-list">
          {tracks.map((track) => (
            <div key={track.id} className="gpx-track-item">
              <span
                className="gpx-track-dot"
                style={{ background: track.color }}
              />
              <span className="gpx-track-name" title={track.name}>
                {track.name}
              </span>
              <span className="gpx-track-pts">
                {track.points.length} pts
              </span>
              <button
                className="gpx-track-remove"
                onClick={() => removeTrack(track.id)}
                title="Remove track"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
