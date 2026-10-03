import { policyRefund } from './cancellation';
import { localTodayIso, timeZoneForPoint, zonedDateTimeToUtc, zoneAbbreviation } from './timezone';

describe('time zones', () => {
  it('detects zones from coordinates', () => {
    expect(timeZoneForPoint(45.68, -111.04)).toBe('America/Denver'); // Bozeman
    expect(timeZoneForPoint(40.72, -74.0)).toBe('America/New_York');
    expect(timeZoneForPoint(51.5, -0.12)).toBe('Europe/London');
  });

  it("knows it is still yesterday on the West Coast when it's early morning UTC", () => {
    const now = new Date('2026-10-03T03:30:00Z');
    expect(localTodayIso('America/Los_Angeles', now)).toBe('2026-10-02');
    expect(localTodayIso('Europe/Berlin', now)).toBe('2026-10-03');
  });

  it('converts a local wall-clock time to the right instant, across DST', () => {
    // 3 PM in Los Angeles: PDT (UTC-7) in summer, PST (UTC-8) in winter.
    expect(zonedDateTimeToUtc('2026-07-01', '15:00', 'America/Los_Angeles').toISOString()).toBe('2026-07-01T22:00:00.000Z');
    expect(zonedDateTimeToUtc('2026-12-01', '15:00', 'America/Los_Angeles').toISOString()).toBe('2026-12-01T23:00:00.000Z');
    // The day clocks fall back (Nov 1 2026) still resolves to the afternoon offset.
    expect(zonedDateTimeToUtc('2026-11-01', '15:00', 'America/New_York').toISOString()).toBe('2026-11-01T20:00:00.000Z');
    expect(zoneAbbreviation('America/Los_Angeles', new Date('2026-07-01T12:00:00Z'))).toBe('PDT');
  });
});

describe('cancellation refunds', () => {
  const checkInAt = new Date('2026-11-10T23:00:00Z');
  const bookedAt = new Date('2026-10-01T12:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('flexible: full refund until 24h before check-in, nothing after', () => {
    expect(policyRefund({ policy: 'FLEXIBLE', paid: 100_00, checkInAt, bookedAt, now: at('2026-11-09T22:59:00Z') }).amount).toBe(100_00);
    expect(policyRefund({ policy: 'FLEXIBLE', paid: 100_00, checkInAt, bookedAt, now: at('2026-11-09T23:01:00Z') }).amount).toBe(0);
  });

  it('moderate: full refund until 5 days before, then half', () => {
    expect(policyRefund({ policy: 'MODERATE', paid: 101_01, checkInAt, bookedAt, now: at('2026-11-04T00:00:00Z') }).percent).toBe(100);
    const late = policyRefund({ policy: 'MODERATE', paid: 101_01, checkInAt, bookedAt, now: at('2026-11-08T00:00:00Z') });
    expect(late).toMatchObject({ percent: 50, amount: 50_50 });
  });

  it('strict: 48h grace when booked 14+ days out, 50% until 7 days before, then nothing', () => {
    expect(policyRefund({ policy: 'STRICT', paid: 100_00, checkInAt, bookedAt, now: at('2026-10-02T12:00:00Z') }).percent).toBe(100);
    expect(policyRefund({ policy: 'STRICT', paid: 100_00, checkInAt, bookedAt, now: at('2026-10-20T12:00:00Z') }).percent).toBe(50);
    expect(policyRefund({ policy: 'STRICT', paid: 100_00, checkInAt, bookedAt, now: at('2026-11-05T12:00:00Z') }).percent).toBe(0);
    // Booked only 10 days out: no 48h grace.
    const lastMinute = new Date('2026-10-31T23:00:00Z');
    expect(policyRefund({ policy: 'STRICT', paid: 100_00, checkInAt, bookedAt: lastMinute, now: at('2026-11-01T00:00:00Z') }).percent).toBe(50);
  });

  it('never refunds once the stay has started', () => {
    expect(policyRefund({ policy: 'FLEXIBLE', paid: 100_00, checkInAt, bookedAt, now: at('2026-11-11T00:00:00Z') }).amount).toBe(0);
  });
});
