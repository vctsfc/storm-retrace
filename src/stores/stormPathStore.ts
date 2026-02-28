import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StormWaypoint {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** UTC timestamp in milliseconds (from timeline frame time when clicked) */
  timeMs: number;
}

export interface StormPathState {
  /** Ordered list of waypoints defining the storm's path */
  waypoints: StormWaypoint[];
  /** Whether the user is currently placing waypoints on the map */
  drawingMode: boolean;
  /** Whether the map should follow the drawn storm path during playback */
  followStorm: boolean;

  startDrawing: () => void;
  addWaypoint: (wp: StormWaypoint) => void;
  /** Remove the last placed waypoint (undo) */
  undoWaypoint: () => void;
  finishDrawing: () => void;
  clearPath: () => void;
  setFollowStorm: (follow: boolean) => void;
}

export const useStormPathStore = create<StormPathState>()(
  persist(
    (set) => ({
      waypoints: [],
      drawingMode: false,
      followStorm: false,

      startDrawing: () =>
        set({ drawingMode: true, waypoints: [], followStorm: false }),

      addWaypoint: (wp) =>
        set((state) => ({
          waypoints: [...state.waypoints, wp],
        })),

      undoWaypoint: () =>
        set((state) => ({
          waypoints: state.waypoints.slice(0, -1),
        })),

      finishDrawing: () =>
        set({ drawingMode: false }),

      clearPath: () =>
        set({ waypoints: [], followStorm: false, drawingMode: false }),

      setFollowStorm: (follow) => set({ followStorm: follow }),
    }),
    {
      name: 'storm-replay-storm-path',
      // Persist the waypoints and follow preference so the path survives page reloads
      partialize: (state) => ({
        waypoints: state.waypoints,
        followStorm: state.followStorm,
      }),
    },
  ),
);
