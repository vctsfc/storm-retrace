// ─── UTC helpers (still used internally by S3 client) ───────────────────────

/**
 * Format a UTC timestamp (ms) as HH:MM:SS UTC string.
 */
export function formatUTCTime(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Format a UTC timestamp (ms) as YYYY-MM-DD string.
 */
export function formatUTCDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a UTC timestamp (ms) as a full date+time string.
 */
export function formatUTCDateTime(ms: number): string {
  return `${formatUTCDate(ms)} ${formatUTCTime(ms)} UTC`;
}

/**
 * Parse a date string (YYYY-MM-DD) and time string (HH:MM) into a UTC timestamp in ms.
 */
export function parseDateTimeUTC(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min, 0);
}

/**
 * Get the date portion as a Date object set to UTC midnight.
 */
export function toUTCMidnight(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Local-timezone helpers ─────────────────────────────────────────────────

/**
 * Get the UTC offset (in ms) for a given UTC instant in a given IANA timezone.
 * Positive means the local clock is AHEAD of UTC (e.g. +5:30 for IST).
 * Negative means behind UTC (e.g. -5:00 for CDT).
 *
 * Uses Intl.DateTimeFormat.formatToParts to extract the local wall-clock
 * components, reconstructs a UTC instant from those components, then diffs.
 */
function getTimezoneOffsetMs(utcMs: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const get = (type: string) => {
    const val = parts.find((p) => p.type === type)?.value ?? '0';
    return parseInt(val, 10);
  };
  // Reconstruct what the wall clock shows in that timezone, interpreted as if UTC
  const wallAsUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'), // midnight edge case
    get('minute'),
    get('second'),
  );
  return wallAsUTC - utcMs;
}

/**
 * Parse a local date string (YYYY-MM-DD) and time string (HH:MM) in the given
 * IANA timezone into a UTC timestamp in ms.
 *
 * Uses a two-pass approach to handle DST transitions correctly:
 *   1. Compute a naive UTC guess using the offset at UTC midnight of the date.
 *   2. Recompute the offset at the guessed UTC instant.
 *   3. If the offset changed (DST boundary), adjust and use the corrected value.
 */
export function parseLocalDateTime(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);

  // The local wall-clock instant we want, expressed as-if-UTC
  const naiveUTC = Date.UTC(y, m - 1, d, h, min, 0);

  // Pass 1: get offset at roughly the right moment (noon of the date)
  const noonGuess = Date.UTC(y, m - 1, d, 12, 0, 0);
  const offset1 = getTimezoneOffsetMs(noonGuess, timeZone);
  const guess = naiveUTC - offset1;

  // Pass 2: verify offset at the guessed instant (handles DST boundary)
  const offset2 = getTimezoneOffsetMs(guess, timeZone);
  if (offset1 !== offset2) {
    // Offset shifted — use the corrected one
    return naiveUTC - offset2;
  }

  return guess;
}

/**
 * Format a UTC timestamp (ms) as HH:MM:SS in the given IANA timezone.
 */
export function formatLocalTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Format a UTC timestamp (ms) as YYYY-MM-DD in the given IANA timezone.
 */
export function formatLocalDate(ms: number, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(ms)); // en-CA gives YYYY-MM-DD
}

/**
 * Get the short timezone abbreviation (e.g. "CDT", "EST", "MST") for a
 * given UTC instant in the given IANA timezone.
 */
export function getTimezoneAbbr(ms: number, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  });
  const parts = fmt.formatToParts(new Date(ms));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}
