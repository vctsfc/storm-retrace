import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackPoint } from '../services/gps/gpxParser';

export interface ChaseTrack {
  /** Unique ID (crypto.randomUUID) */
  id: string;
  /** Track name from GPX <name> or filename */
  name: string;
  /** Display color (auto-assigned from palette) */
  color: string;
  /** Sorted track points (by time) */
  points: TrackPoint[];
  /** Whether this individual track is visible */
  visible: boolean;
}

const TRACK_COLORS = [
  '#44aaff', // Blue
  '#ff4444', // Red
  '#44ff44', // Green
  '#ffaa00', // Orange
  '#ff44ff', // Magenta
  '#44ffff', // Cyan
];

export interface TrackState {
  tracks: ChaseTrack[];
  tracksVisible: boolean;
  tracksOpacity: number;
  /** Show breadcrumb trail (track path up to current time) */
  showTrail: boolean;
  /** Lock map center onto the chaser's current position during playback */
  followTrack: boolean;

  addTrack: (track: ChaseTrack) => void;
  removeTrack: (id: string) => void;
  setTrackVisible: (id: string, visible: boolean) => void;
  setTracksVisible: (visible: boolean) => void;
  setTracksOpacity: (opacity: number) => void;
  setShowTrail: (show: boolean) => void;
  setFollowTrack: (follow: boolean) => void;
  clearTracks: () => void;
}

/**
 * Get the next auto-assigned color for a new track.
 * Cycles through the palette based on current track count.
 */
export function getNextTrackColor(existingCount: number): string {
  return TRACK_COLORS[existingCount % TRACK_COLORS.length];
}

export const useTrackStore = create<TrackState>()(
  persist(
    (set) => ({
      tracks: [],
      tracksVisible: true,
      tracksOpacity: 1.0,
      showTrail: true,
      followTrack: false,

      addTrack: (track) =>
        set((state) => ({
          tracks: [...state.tracks, track],
        })),

      removeTrack: (id) =>
        set((state) => ({
          tracks: state.tracks.filter((t) => t.id !== id),
        })),

      setTrackVisible: (id, visible) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === id ? { ...t, visible } : t,
          ),
        })),

      setTracksVisible: (visible) => set({ tracksVisible: visible }),
      setTracksOpacity: (opacity) => set({ tracksOpacity: opacity }),
      setShowTrail: (show) => set({ showTrail: show }),
      setFollowTrack: (follow) => set({ followTrack: follow }),
      clearTracks: () => set({ tracks: [] }),
    }),
    {
      name: 'storm-replay-tracks',
      // Only persist display preferences — NOT the track data (re-imported each session)
      partialize: (state) => ({
        tracksVisible: state.tracksVisible,
        tracksOpacity: state.tracksOpacity,
        showTrail: state.showTrail,
        followTrack: state.followTrack,
      }),
    },
  ),
);
