import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ExportFormat = 'png' | 'gif' | 'mp4';

export interface ExportState {
  /** Output format */
  format: ExportFormat;
  /** Output video frame rate */
  fps: number;
  /** Playback speed multiplier for animation timing */
  speed: number;
  /** Whether an export is currently in progress */
  exporting: boolean;
  /** Export progress 0-1 */
  progress: number;
  /** Human-readable progress message */
  progressMessage: string;
  /** Whether to export only the loop range (vs all frames) */
  useLoopRange: boolean;

  /** Include storm attributes overlay in export */
  showStormAttrs: boolean;
  /** Include radar legend in export */
  showRadarLegend: boolean;
  /** Include distance-to-storm overlay in export */
  showDistanceBearing: boolean;

  setFormat: (format: ExportFormat) => void;
  setFps: (fps: number) => void;
  setSpeed: (speed: number) => void;
  setExporting: (exporting: boolean) => void;
  setProgress: (progress: number, message?: string) => void;
  setUseLoopRange: (use: boolean) => void;
  setShowStormAttrs: (show: boolean) => void;
  setShowRadarLegend: (show: boolean) => void;
  setShowDistanceBearing: (show: boolean) => void;
}

export const useExportStore = create<ExportState>()(
  persist(
    (set) => ({
      format: 'mp4',
      fps: 30,
      speed: 1,
      exporting: false,
      progress: 0,
      progressMessage: '',
      useLoopRange: false,
      showStormAttrs: true,
      showRadarLegend: true,
      showDistanceBearing: true,

      setFormat: (format) => set({ format }),
      setFps: (fps) => set({ fps }),
      setSpeed: (speed) => set({ speed }),
      setExporting: (exporting) => set({ exporting }),
      setProgress: (progress, message) =>
        set({ progress, ...(message !== undefined ? { progressMessage: message } : {}) }),
      setUseLoopRange: (use) => set({ useLoopRange: use }),
      setShowStormAttrs: (show) => set({ showStormAttrs: show }),
      setShowRadarLegend: (show) => set({ showRadarLegend: show }),
      setShowDistanceBearing: (show) => set({ showDistanceBearing: show }),
    }),
    {
      name: 'storm-replay-export',
      partialize: (state) => ({
        format: state.format,
        fps: state.fps,
        speed: state.speed,
        useLoopRange: state.useLoopRange,
        showStormAttrs: state.showStormAttrs,
        showRadarLegend: state.showRadarLegend,
        showDistanceBearing: state.showDistanceBearing,
      }),
    },
  ),
);
