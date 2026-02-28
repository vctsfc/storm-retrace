/// <reference types="vite/client" />

declare module 'nexrad-level-2-data' {
  export class Level2Radar {
    constructor(data: ArrayBuffer | Buffer);
    header: {
      icao?: string;
      ICAO?: string;
      date?: number | string;
      time?: number | string;
    };
    vcp: number;
    listElevations(): number[];
    setElevation(elevationNumber: number): void;
    getHighresReflectivity(): HighResData | null;
    getHighresVelocity(): HighResData | null;
    getHighresSpectrum(): HighResData | null;
    getHighresDiffReflectivity(): HighResData | null;
    getHighresDiffPhase(): HighResData | null;
    getHighresCorrelationCoefficient(): HighResData | null;
  }

  interface HighResData {
    gate_count: number;
    first_gate: number;
    gate_size: number;
    azimuth: number[];
    data: number[][];
  }
}
