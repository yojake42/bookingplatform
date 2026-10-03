/**
 * Calendar dates are plain days with no time zone: they travel as `YYYY-MM-DD` strings and are
 * represented in JS as Dates at UTC midnight (which is what Prisma returns for `@db.Date`).
 */

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayMs = 24 * 60 * 60 * 1000;

export function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = isoDatePattern.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // Reject roll-overs such as 2026-02-31.
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) {
    return null;
  }
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs);
}

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / dayMs);
}

export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type DateRange = { start: Date; end: Date };

/** Half-open ranges [start, end): a range ending on day X does not overlap one starting on X. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Merges overlapping or touching ranges; input order does not matter. */
export function mergeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = ranges
    .filter((range) => range.start.getTime() < range.end.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: DateRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start.getTime() <= last.end.getTime()) {
      if (range.end.getTime() > last.end.getTime()) last.end = range.end;
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}
