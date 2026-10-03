import { mergeRanges, parseIsoDate, rangesOverlap, toIsoDate } from './dates';
import { quoteStay, validateStay } from './stay';

const d = (value: string) => parseIsoDate(value)!;
const rules = { maxGuests: 4, minNights: 2, maxNights: 14 };
const today = d('2026-10-02');

describe('dates', () => {
  it('parses strict ISO dates and rejects roll-overs', () => {
    expect(toIsoDate(d('2026-02-28'))).toBe('2026-02-28');
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('2026-2-3')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });

  it('treats ranges as half-open so checkout day can be the next check-in', () => {
    expect(rangesOverlap({ start: d('2026-10-01'), end: d('2026-10-05') }, { start: d('2026-10-05'), end: d('2026-10-07') })).toBe(false);
    expect(rangesOverlap({ start: d('2026-10-01'), end: d('2026-10-05') }, { start: d('2026-10-04'), end: d('2026-10-07') })).toBe(true);
    expect(rangesOverlap({ start: d('2026-10-01'), end: d('2026-10-10') }, { start: d('2026-10-03'), end: d('2026-10-04') })).toBe(true);
  });

  it('merges overlapping and touching ranges', () => {
    const merged = mergeRanges([
      { start: d('2026-10-10'), end: d('2026-10-12') },
      { start: d('2026-10-01'), end: d('2026-10-05') },
      { start: d('2026-10-05'), end: d('2026-10-07') },
      { start: d('2026-10-11'), end: d('2026-10-15') },
    ]).map((range) => [toIsoDate(range.start), toIsoDate(range.end)]);
    expect(merged).toEqual([
      ['2026-10-01', '2026-10-07'],
      ['2026-10-10', '2026-10-15'],
    ]);
  });
});

describe('validateStay', () => {
  const valid = { checkIn: '2026-10-10', checkOut: '2026-10-13', guests: 2 };

  it('accepts a valid stay and counts nights', () => {
    const result = validateStay(rules, valid, { enforceNightLimits: true, today });
    expect(result).toEqual({ ok: true, stay: { checkIn: d('2026-10-10'), checkOut: d('2026-10-13'), nights: 3 } });
  });

  it.each([
    [{ ...valid, checkOut: '2026-10-10' }, 'Check-out must be after check-in.'],
    [{ ...valid, checkIn: '2026-09-20' }, 'Check-in cannot be in the past.'],
    [{ ...valid, guests: 5 }, 'This home allows up to 4 guests.'],
    [{ ...valid, guests: 0 }, 'At least one guest is required.'],
    [{ ...valid, checkOut: '2026-10-11' }, 'This home has a 2-night minimum.'],
    [{ ...valid, checkOut: '2026-11-10' }, 'Stays are limited to 14 nights.'],
    [{ ...valid, checkIn: 'soon' }, 'Dates must be valid YYYY-MM-DD values.'],
  ])('rejects %j', (input, message) => {
    expect(validateStay(rules, input, { enforceNightLimits: true, today })).toEqual({ ok: false, message });
  });

  it("treats the home's local date as today: tonight is bookable, yesterday is not", () => {
    expect(validateStay(rules, { checkIn: '2026-10-02', checkOut: '2026-10-04', guests: 1 }, { enforceNightLimits: true, today }).ok).toBe(true);
    expect(validateStay(rules, { checkIn: '2026-10-01', checkOut: '2026-10-04', guests: 1 }, { enforceNightLimits: true, today }).ok).toBe(false);
  });

  it('lets staff bend night limits but not capacity', () => {
    expect(validateStay(rules, { ...valid, checkOut: '2026-10-11' }, { enforceNightLimits: false, today }).ok).toBe(true);
    expect(validateStay(rules, { ...valid, guests: 9 }, { enforceNightLimits: false, today }).ok).toBe(false);
  });
});

describe('quoteStay', () => {
  it('adds the cleaning fee once', () => {
    expect(quoteStay({ nightlyPrice: 20000, cleaningFee: 7500, currency: 'USD' }, 3)).toEqual({
      nights: 3,
      nightlyPrice: 20000,
      nightsTotal: 60000,
      cleaningFee: 7500,
      total: 67500,
      currency: 'USD',
    });
  });
});
