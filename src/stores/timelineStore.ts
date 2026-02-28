import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TimelineState {
  /** Sorted list of available frame timestamps (UTC ms) */
  frameTimes: number[];
  /** Index into frameTimes for the current frame */
  currentIndex: number;
  /** Whether playback is active */
  playing: boolean;
  /** Playback speed multiplier (1, 2, 4, 8, 16) */
  speed: number;
  /** Loop start index (null = beginning) */
  loopStart: number | null;
  /** Loop end index (null = end) */
  loopEnd: number | null;
  /** Whether looping is enabled */
  loopEnabled: boolean;

  setFrameTimes: (times: number[]) => void;
  setCurrentIndex: (index: number) => void;
  stepForward: (n?: number) => void;
  stepBackward: (n?: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setLoopStart: () => void;
  setLoopEnd: () => void;
  clearLoop: () => void;
  toggleLoop: () => void;
  goToStart: () => void;
  goToEnd: () => void;
}

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set, get) => ({
      frameTimes: [],
      currentIndex: 0,
      playing: false,
      speed: 1,
      loopStart: null,
      loopEnd: null,
      loopEnabled: true,

      setFrameTimes: (times) => set({ frameTimes: times, currentIndex: 0 }),

      setCurrentIndex: (index) => {
        const { frameTimes } = get();
        if (index >= 0 && index < frameTimes.length) {
          set({ currentIndex: index });
        }
      },

      stepForward: (n = 1) => {
        const { currentIndex, frameTimes, loopStart, loopEnd, loopEnabled } = get();
        const maxIndex = loopEnabled && loopEnd !== null ? loopEnd : frameTimes.length - 1;
        const minIndex = loopEnabled && loopStart !== null ? loopStart : 0;
        let next = currentIndex + n;
        if (next > maxIndex) {
          next = loopEnabled ? minIndex : maxIndex;
        }
        set({ currentIndex: next });
      },

      stepBackward: (n = 1) => {
        const { currentIndex, loopStart, loopEnd, loopEnabled, frameTimes } = get();
        const minIndex = loopEnabled && loopStart !== null ? loopStart : 0;
        const maxIndex = loopEnabled && loopEnd !== null ? loopEnd : frameTimes.length - 1;
        let next = currentIndex - n;
        if (next < minIndex) {
          next = loopEnabled ? maxIndex : minIndex;
        }
        set({ currentIndex: next });
      },

      togglePlay: () => set((s) => ({ playing: !s.playing })),
      setPlaying: (playing) => set({ playing }),
      setSpeed: (speed) => set({ speed }),

      setLoopStart: () => set((s) => ({ loopStart: s.currentIndex, loopEnabled: true })),
      setLoopEnd: () => set((s) => ({ loopEnd: s.currentIndex, loopEnabled: true })),
      clearLoop: () => set({ loopStart: null, loopEnd: null }),
      toggleLoop: () => set((s) => ({ loopEnabled: !s.loopEnabled })),

      goToStart: () => {
        const { loopStart, loopEnabled } = get();
        set({ currentIndex: loopEnabled && loopStart !== null ? loopStart : 0 });
      },

      goToEnd: () => {
        const { loopEnd, loopEnabled, frameTimes } = get();
        set({ currentIndex: loopEnabled && loopEnd !== null ? loopEnd : frameTimes.length - 1 });
      },
    }),
    {
      name: 'storm-replay-timeline',
      // Only persist playback preferences — NOT frame data or playback state
      partialize: (state) => ({
        speed: state.speed,
        loopEnabled: state.loopEnabled,
      }),
    },
  ),
);
