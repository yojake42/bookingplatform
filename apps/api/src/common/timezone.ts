import tzLookup from '@photostructure/tz-lookup';
import { parseIsoDate, toIsoDate } from './dates';

/**
 * Time-zone math with the built-in Intl API (no tz database dependency beyond the platform's).
 * Calendar dates stay plain `YYYY-MM-DD` values; these helpers answer "what day is it at the home"
 * and "what instant is 3 PM on the check-in date at the home".
 */

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** IANA zone for a coordinate, using an offline boundary dataset. */
export function timeZoneForPoint(latitude: number, longitude: number): string {
  try {
    const zone = tzLookup(latitude, longitude);
    return zone && isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function zonedParts(instant: Date, zone: string) {
  let formatter = partsCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(zone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Today's calendar date at the home, as a UTC-midnight Date (the shape Prisma uses for @db.Date). */
export function localToday(zone: string, now = new Date()): Date {
  const parts = zonedParts(now, zone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function localTodayIso(zone: string, now = new Date()): string {
  return toIsoDate(localToday(zone, now));
}

/** Offset of `zone` from UTC at `instant`, in minutes (e.g. -420 for PDT). */
function offsetMinutes(instant: Date, zone: string): number {
  const parts = zonedParts(instant, zone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The instant at which the wall-clock time `time` (HH:MM) occurs on `date` in `zone`.
 * Two passes handle DST transitions; a non-existent local time (spring-forward gap) resolves forward.
 */
export function zonedDateTimeToUtc(date: Date | string, time: string, zone: string): Date {
  const day = typeof date === 'string' ? parseIsoDate(date) : date;
  if (!day) throw new Error(`Invalid date ${String(date)}`);
  const [hours, minutes] = time.split(':').map(Number);
  const wallClock = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes);
  let guess = wallClock - offsetMinutes(new Date(wallClock), zone) * 60_000;
  guess = wallClock - offsetMinutes(new Date(guess), zone) * 60_000;
  return new Date(guess);
}

/** Short zone label for display, e.g. "PDT" or "GMT+2". */
export function zoneAbbreviation(zone: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
    .formatToParts(at)
    .find((item) => item.type === 'timeZoneName');
  return part?.value ?? zone;
}

/** Local "today" for each distinct zone, so queries spanning many homes can use each home's own date. */
export function localTodayByZone(zones: Iterable<string>, now = new Date()) {
  return new Map([...new Set(zones)].map((zone) => [zone, localToday(zone, now)]));
}

