import type { ScanFile } from './types';

const BUCKET = 'unidata-nexrad-level2';
const BUCKET_URL = `https://${BUCKET}.s3.amazonaws.com`;

function formatDatePath(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function parseTimestamp(filename: string): number | null {
  // Format: KXXX20130520_235959_V06
  const match = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, min, sec] = match;
  return Date.UTC(+year, +month - 1, +day, +hour, +min, +sec);
}

/**
 * List all volume scan files for a given NEXRAD site and date.
 * Handles pagination via S3 ListObjectsV2.
 */
export async function listScans(siteId: string, date: Date): Promise<ScanFile[]> {
  const prefix = `${formatDatePath(date)}/${siteId}/`;
  const files: ScanFile[] = [];
  let continuationToken: string | null = null;

  do {
    const params = new URLSearchParams({
      'list-type': '2',
      prefix,
      ...(continuationToken ? { 'continuation-token': continuationToken } : {}),
    });

    const response = await fetch(`${BUCKET_URL}?${params}`);
    if (!response.ok) {
      throw new Error(`S3 listing failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const contents = doc.querySelectorAll('Contents');
    for (const item of contents) {
      const key = item.querySelector('Key')?.textContent;
      const size = parseInt(item.querySelector('Size')?.textContent ?? '0', 10);

      if (!key) continue;

      // Skip MDM (metadata) files and non-volume-scan files
      const filename = key.split('/').pop() ?? '';
      if (filename.includes('MDM') || filename.startsWith('NWS_')) continue;

      const timestamp = parseTimestamp(filename);
      if (timestamp === null) continue;

      files.push({ key, timestamp, size });
    }

    // Check for pagination
    const isTruncated = doc.querySelector('IsTruncated')?.textContent === 'true';
    const nextToken = doc.querySelector('NextContinuationToken')?.textContent;
    continuationToken = isTruncated && nextToken ? nextToken : null;
  } while (continuationToken);

  // Sort by timestamp
  files.sort((a, b) => a.timestamp - b.timestamp);
  return files;
}

/**
 * List scans across multiple dates (for events spanning midnight UTC).
 */
export async function listScansForRange(
  siteId: string,
  startDate: Date,
  endDate: Date,
): Promise<ScanFile[]> {
  const dates: Date[] = [];
  const current = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  ));
  const end = new Date(Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  ));

  while (current <= end) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const allFiles = await Promise.all(dates.map((d) => listScans(siteId, d)));
  const merged = allFiles.flat().sort((a, b) => a.timestamp - b.timestamp);

  // Filter to the requested time range
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  return merged.filter((f) => f.timestamp >= startMs && f.timestamp <= endMs);
}

/**
 * Fetch a single scan file as ArrayBuffer from S3.
 * Supports AbortSignal for cancellation (used by prefetch manager).
 */
export async function fetchScan(key: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(`${BUCKET_URL}/${key}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch scan ${key}: ${response.status}`);
  }
  return response.arrayBuffer();
}
