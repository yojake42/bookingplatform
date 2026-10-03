import { addDays, addMonths, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import type { DateSpan } from './types';

/** ISO `YYYY-MM-DD` strings compare correctly as plain strings, which keeps this module simple. */
export function toIso(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function todayIso() {
  return toIso(new Date());
}

/** Today's date in a given IANA zone, e.g. the home's local date (may differ from the viewer's). */
export function todayInZone(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysIso(iso: string, days: number) {
  return toIso(addDays(parseISO(iso), days));
}

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function addMonthsIso(iso: string, months: number) {
  return toIso(addMonths(parseISO(iso), months));
}

/** Calendar grid for a month: leading nulls for alignment (weeks start on Sunday), then ISO days. */
export function monthGrid(monthStartIso: string): (string | null)[] {
  const start = startOfMonth(parseISO(monthStartIso));
  const end = endOfMonth(start);
  const cells: (string | null)[] = Array.from({ length: getDay(start) }, () => null);
  for (let day = start; day <= end; day = addDays(day, 1)) cells.push(toIso(day));
  return cells;
}

/** Is the *night* starting on `iso` taken by any unavailable span ([start, end))? */
export function isNightBlocked(iso: string, spans: DateSpan[]) {
  return spans.some((span) => span.start <= iso && iso < span.end);
}

/** First blocked night on or after `iso`, or null. A stay starting at `iso` must check out on or before it. */
export function nextBlockedNight(iso: string, spans: DateSpan[]) {
  let best: string | null = null;
  for (const span of spans) {
    const candidate = span.start >= iso ? span.start : span.end > iso ? iso : null;
    if (candidate && (!best || candidate < best)) best = candidate;
  }
  return best;
}

export type DayState = {
  /** Can be picked as check-in. */
  canCheckIn: boolean;
  /** Can be picked as check-out for the current check-in. */
  canCheckOut: boolean;
  /** Reason shown when hovering a day that cannot be picked. */
  hint: string | null;
  /** Night is unavailable but the day is a valid checkout (shown with a subtle style). */
  checkoutOnly: boolean;
  past: boolean;
  blocked: boolean;
};

export function dayState(
  iso: string,
  context: { today: string; spans: DateSpan[]; checkIn?: string | null; checkOut?: string | null; minNights: number; maxNights: number },
): DayState {
  const past = iso < context.today;
  const blocked = isNightBlocked(iso, context.spans);
  const canCheckIn = !past && !blocked;
  let canCheckOut = false;
  let hint: string | null = null;

  if (context.checkIn && !context.checkOut && iso > context.checkIn) {
    const limit = nextBlockedNight(context.checkIn, context.spans);
    const nights = Math.round((parseISO(iso).getTime() - parseISO(context.checkIn).getTime()) / 86_400_000);
    if (limit && iso > limit) hint = 'Unavailable';
    else if (nights < context.minNights) hint = `${context.minNights}-night minimum`;
    else if (nights > context.maxNights) hint = `${context.maxNights}-night maximum`;
    else canCheckOut = true;
  }

  const checkoutOnly = blocked && !past && !isNightBlocked(addDaysIso(iso, -1), context.spans) && iso > context.today;
  return { canCheckIn, canCheckOut, hint, checkoutOnly, past, blocked };
}

/**
 * Applies a click to the current selection, returning the new [checkIn, checkOut].
 * Mirrors the familiar pattern: first click picks check-in, second picks check-out; clicking an
 * earlier/invalid day while choosing check-out restarts from that day.
 */
export function applyDayClick(
  iso: string,
  current: { checkIn?: string | null; checkOut?: string | null },
  state: DayState,
): { checkIn: string | null; checkOut: string | null } | null {
  const choosingCheckOut = current.checkIn && !current.checkOut;
  if (choosingCheckOut && state.canCheckOut) return { checkIn: current.checkIn!, checkOut: iso };
  if (state.canCheckIn) return { checkIn: iso, checkOut: null };
  return null;
}
