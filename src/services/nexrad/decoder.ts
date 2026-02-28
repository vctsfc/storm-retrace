import { Level2Radar } from 'nexrad-level-2-data';
import pako from 'pako';

export interface DecodedScan {
  radar: Level2Radar;
  timestamp: number;
  siteId: string;
  vcp: number;
  elevations: number[];
}

/**
 * Decompress gzip data if needed. S3 NEXRAD files are often .gz compressed.
 * Gzip magic bytes: 0x1f 0x8b
 */
function maybeGunzip(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const decompressed = pako.ungzip(bytes);
    return decompressed.buffer;
  }
  return buffer;
}

/**
 * Decode a NEXRAD Level 2 archive file from an ArrayBuffer.
 * Returns the Level2Radar instance along with metadata.
 */
export async function decodeScan(buffer: ArrayBuffer): Promise<DecodedScan> {
  const data = maybeGunzip(buffer);
  // nexrad-level-2-data requires Buffer (instanceof check), not plain ArrayBuffer
  const buf = Buffer.from(new Uint8Array(data));
  const radar = new Level2Radar(buf);

  const header = radar.header ?? {};
  const siteId = header.icao ?? header.ICAO ?? '';
  const vcp = typeof radar.vcp === 'number' ? radar.vcp : 0;
  const elevationIndices = radar.listElevations?.() ?? [];

  // Extract physical elevation angles from the raw data records
  const radarData = (radar as any).data;
  const elevations = elevationIndices.map((idx: number) => {
    const elevData = radarData?.[idx];
    const angle = elevData?.[0]?.record?.elevation_angle;
    return typeof angle === 'number' ? Math.round(angle * 10) / 10 : idx;
  });

  // Parse timestamp from the header
  const dateStr = header.date;
  const timeStr = header.time;
  let timestamp = 0;
  if (dateStr && timeStr) {
    // header.date is Julian date (days since epoch), header.time is ms since midnight
    const julianDays = typeof dateStr === 'number' ? dateStr : parseInt(dateStr, 10);
    const msOfDay = typeof timeStr === 'number' ? timeStr : parseInt(timeStr, 10);
    // Julian date epoch for NEXRAD is January 1, 1970 (modified Julian)
    timestamp = (julianDays - 1) * 86400000 + msOfDay;
  }

  return {
    radar,
    timestamp,
    siteId,
    vcp,
    elevations,
  };
}

/**
 * Get reflectivity data for a specific elevation from a decoded scan.
 */
export function getReflectivity(radar: Level2Radar, elevationNumber: number) {
  radar.setElevation(elevationNumber);
  return radar.getHighresReflectivity?.() ?? null;
}

/**
 * Get velocity data for a specific elevation from a decoded scan.
 */
export function getVelocity(radar: Level2Radar, elevationNumber: number) {
  radar.setElevation(elevationNumber);
  return radar.getHighresVelocity?.() ?? null;
}
