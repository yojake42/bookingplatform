import { differenceInCalendarDays, format, parseISO } from 'date-fns';

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** Formats minor units (cents). Whole amounts drop the decimals for a cleaner look. */
export function money(minor: number, currency = 'USD', options: { exact?: boolean } = {}) {
  const exact = options.exact || minor % 100 !== 0;
  const key = `${currency}:${exact}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: exact ? 2 : 0,
      maximumFractionDigits: exact ? 2 : 0,
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter.format(minor / 100);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function bathsLabel(count: number) {
  return `${Number.isInteger(count) ? count : count.toFixed(1)} ${count === 1 ? 'bath' : 'baths'}`;
}

export function shortDate(iso: string) {
  return format(parseISO(iso), 'MMM d');
}

export function longDate(iso: string) {
  return format(parseISO(iso), 'EEE, MMM d, yyyy');
}

export function dateRangeLabel(start?: string | null, end?: string | null) {
  if (!start) return '';
  if (!end) return shortDate(start);
  const a = parseISO(start);
  const b = parseISO(end);
  if (a.getFullYear() !== b.getFullYear()) return `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`;
  if (a.getMonth() === b.getMonth()) return `${format(a, 'MMM d')} – ${format(b, 'd')}`;
  return `${format(a, 'MMM d')} – ${format(b, 'MMM d')}`;
}

export function nightsBetween(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start));
}

export function time12h(value: string) {
  const [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

export function rating(value: number | null | undefined) {
  return value == null ? '—' : value.toFixed(2).replace(/0$/, '');
}

export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function placeLabel(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(', ');
}

/** Mirrors apps/api/src/common/cancellation.ts. */
export const cancellationPolicies = {
  FLEXIBLE: { label: 'Flexible', description: 'Full refund if you cancel at least 24 hours before check-in. No refund after that.' },
  MODERATE: { label: 'Moderate', description: 'Full refund if you cancel at least 5 days before check-in. 50% refund after that, until check-in.' },
  STRICT: {
    label: 'Strict',
    description: 'Full refund within 48 hours of booking if check-in is at least 14 days away. 50% refund if you cancel at least 7 days before check-in. No refund after that.',
  },
} as const;

/** "3:00 PM PDT" for an instant, shown in the home's time zone. */
export function zonedClock(instant: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(instant));
}

/** "Tue, Nov 10, 3:00 PM PST" for an instant, shown in the home's time zone. */
export function zonedDateTime(instant: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(instant));
}

/** "Mountain Time (Denver)"-style label for an IANA zone. */
export function zoneLabel(timeZone: string) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value;
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ');
  return name && city ? `${name} (${city})` : timeZone;
}
