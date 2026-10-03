import { describe, expect, it } from 'vitest';
import { applyDayClick, dayState, isNightBlocked, monthGrid, nextBlockedNight } from './calendar';

const spans = [
  { start: '2026-10-10', end: '2026-10-13' }, // nights of the 10th, 11th, 12th
  { start: '2026-10-20', end: '2026-10-21' },
];
const base = { today: '2026-10-02', spans, minNights: 2, maxNights: 10 };

describe('calendar helpers', () => {
  it('builds a Sunday-aligned month grid', () => {
    const grid = monthGrid('2026-10-01');
    expect(grid.slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']); // Oct 1 2026 is a Thursday
    expect(grid[grid.length - 1]).toBe('2026-10-31');
  });

  it('treats spans as nights, so the end day is free', () => {
    expect(isNightBlocked('2026-10-10', spans)).toBe(true);
    expect(isNightBlocked('2026-10-12', spans)).toBe(true);
    expect(isNightBlocked('2026-10-13', spans)).toBe(false);
  });

  it('finds the next blocked night', () => {
    expect(nextBlockedNight('2026-10-05', spans)).toBe('2026-10-10');
    expect(nextBlockedNight('2026-10-11', spans)).toBe('2026-10-11');
    expect(nextBlockedNight('2026-10-13', spans)).toBe('2026-10-20');
    expect(nextBlockedNight('2026-10-25', spans)).toBeNull();
  });

  it('lets a stay check out on the first day of a blocked span but not past it', () => {
    const context = { ...base, checkIn: '2026-10-07' };
    expect(dayState('2026-10-10', context).canCheckOut).toBe(true);
    expect(dayState('2026-10-11', context).canCheckOut).toBe(false);
    expect(dayState('2026-10-11', context).hint).toBe('Unavailable');
  });

  it('enforces minimum and maximum nights', () => {
    const context = { ...base, checkIn: '2026-10-13' };
    expect(dayState('2026-10-14', context).hint).toBe('2-night minimum');
    expect(dayState('2026-10-15', context).canCheckOut).toBe(true);
    const long = { ...base, spans: [], checkIn: '2026-10-01' };
    expect(dayState('2026-10-12', long).hint).toBe('10-night maximum');
  });

  it('marks past days and blocked nights as non-selectable check-ins', () => {
    expect(dayState('2026-10-01', base).canCheckIn).toBe(false);
    expect(dayState('2026-10-11', base).canCheckIn).toBe(false);
    expect(dayState('2026-10-13', base).canCheckIn).toBe(true);
    expect(dayState('2026-10-10', base).checkoutOnly).toBe(true);
  });

  it('restarts the selection when clicking an earlier valid day', () => {
    const current = { checkIn: '2026-10-15', checkOut: null };
    const state = dayState('2026-10-05', { ...base, ...current });
    expect(applyDayClick('2026-10-05', current, state)).toEqual({ checkIn: '2026-10-05', checkOut: null });
  });
});
