#!/usr/bin/env node
/**
 * End-to-end proof that double bookings are impossible, run against a live API
 * (works against a single instance or a load-balanced multi-replica stack).
 *
 *   node scripts/double-booking-race.mjs                                     # dev stack (http://localhost:3100/api)
 *   API_URL=http://localhost:8080/api node scripts/double-booking-race.mjs   # prod stack via nginx
 *
 * Website bookings hold their dates from the moment they're created (while the guest pays), so the
 * race is decided at booking creation. Uses a free window ~1-1.5 years out and removes everything it creates.
 */
const api = process.env.API_URL ?? 'http://localhost:3100/api';
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? '  ✔' : '  ✘'} ${message}`);
  if (!condition) failures += 1;
};

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers };
}

const book = async (listingId, checkIn, checkOut, n, extra = {}) => {
  const result = await call('/public/bookings', {
    method: 'POST',
    body: { listingId, checkIn: iso(checkIn), checkOut: iso(checkOut), guests: 1, guestName: `Race Tester ${n}`, guestEmail: `race${n}@example.com`, acceptTerms: true, ...extra },
  });
  if (result.status === 429) throw new Error('Hit the booking rate limit (429). Raise BOOKING_RATE_LIMIT_PER_HOUR for this test run and retry.');
  return result;
};

async function main() {
  const health = await Promise.all(Array.from({ length: 6 }, () => call('/health')));
  const instances = new Set(health.map((result) => result.data?.instance));
  console.log(`API ${api} — responses from ${instances.size} instance(s): ${[...instances].join(', ')}`);

  const login = await call('/auth/login', { method: 'POST', body: { email: adminEmail, password: adminPassword } });
  if (login.status !== 200) throw new Error(`Admin login failed (${login.status}); set ADMIN_EMAIL / ADMIN_PASSWORD`);
  const staff = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': login.data.csrfToken };

  const { data: search } = await call('/public/listings');

  // A listing with a completely free 180-night window inside the two-year booking horizon.
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  let listing;
  let base;
  for (const candidateListing of search.items) {
    for (let attempt = 0; attempt < 8 && !base; attempt += 1) {
      const candidate = addDays(today, 360 + Math.floor(Math.random() * 180));
      const { data } = await call(`/public/listings/${candidateListing.id}/availability?from=${iso(candidate)}&to=${iso(addDays(candidate, 180))}`);
      if (!data.unavailable.length) base = candidate;
    }
    if (base) {
      listing = candidateListing;
      break;
    }
  }
  if (!base) throw new Error('Could not find a free 180-night window to test with.');
  const { data: detail } = await call(`/public/listings/${listing.id}`);
  const nights = Math.max(detail.minNights, 3);
  console.log(`Listing: ${listing.title} (min ${detail.minNights} nights), window from ${iso(base)}\n`);

  const created = [];
  const blocks = [];
  try {
    // 1. Many guests race for the exact same nights.
    console.log('1. 15 concurrent requests for identical dates');
    const same = await Promise.all(Array.from({ length: 15 }, (_, n) => book(listing.id, base, addDays(base, nights), n)));
    const winners = same.filter((result) => result.status === 201);
    created.push(...winners.map((result) => result.data));
    check(winners.length === 1, `exactly one booking succeeded (got ${winners.length})`);
    check(same.filter((result) => result.status === 409).length === 14, 'the other 14 were rejected with 409 Conflict');

    // 2. Partially overlapping ranges racing each other.
    console.log('\n2. 12 concurrent requests for three mutually-overlapping ranges');
    const start2 = addDays(base, 40);
    const shifted = await Promise.all(
      Array.from({ length: 12 }, (_, n) => book(listing.id, addDays(start2, n % 3), addDays(start2, (n % 3) + nights + 2), 100 + n)),
    );
    const shiftedWinners = shifted.filter((result) => result.status === 201);
    created.push(...shiftedWinners.map((result) => result.data));
    check(shiftedWinners.length === 1, `exactly one overlapping range won (got ${shiftedWinners.length})`);

    // 3. Back-to-back stays share a turnover day and must both succeed.
    console.log('\n3. Back-to-back stays (checkout day = next check-in)');
    const start3 = addDays(base, 80);
    const [first, second] = await Promise.all([
      book(listing.id, start3, addDays(start3, nights), 200),
      book(listing.id, addDays(start3, nights), addDays(start3, nights * 2), 201),
    ]);
    created.push(...[first, second].filter((result) => result.status === 201).map((result) => result.data));
    check(first.status === 201 && second.status === 201, 'both adjacent stays were accepted');

    // 4. Idempotent retries return the same booking instead of failing or duplicating.
    console.log('\n4. 5 concurrent retries with the same idempotency key');
    const start4 = addDays(base, 120);
    const key = `race-${Date.now()}`;
    const retries = await Promise.all(Array.from({ length: 5 }, () => book(listing.id, start4, addDays(start4, nights), 300, { idempotencyKey: key })));
    const codes = new Set(retries.filter((result) => result.status === 201).map((result) => result.data.code));
    created.push(...retries.filter((result) => result.status === 201).map((result) => result.data).slice(0, 1));
    check(retries.every((result) => result.status === 201) && codes.size === 1, `all retries resolved to one booking (${[...codes].join(', ')})`);

    // 5. Staff blocks can't overlap bookings; cancelling releases the nights.
    console.log('\n5. Blocks vs bookings, and cancellation releasing nights');
    const block = await call(`/admin/listings/${listing.id}/blocks`, { method: 'POST', headers: staff, body: { startDate: iso(addDays(base, 1)), endDate: iso(addDays(base, 2)), note: 'race test' } });
    if (block.status === 201) blocks.push(block.data.id);
    check(block.status === 409, `block overlapping a booking was rejected (${block.status}: ${block.data?.message})`);

    const blockFree = await call(`/admin/listings/${listing.id}/blocks`, { method: 'POST', headers: staff, body: { startDate: iso(addDays(base, 160)), endDate: iso(addDays(base, 170)), note: 'race test' } });
    if (blockFree.status === 201) blocks.push(blockFree.data.id);
    check(blockFree.status === 201, 'block on open nights succeeded');
    const intoBlock = await book(listing.id, addDays(base, 165), addDays(base, 165 + nights), 400);
    check(intoBlock.status === 409, `booking inside a blocked period was rejected (${intoBlock.status})`);

    if (!winners.length) throw new Error('No winning booking to cancel; skipping the release check.');
    const lookup = await call(`/admin/bookings?view=all&q=${winners[0].data.code}`, { headers: staff });
    const cancel = await call(`/admin/bookings/${lookup.data.items[0].id}/cancel`, { method: 'POST', headers: staff, body: { reason: 'race test' } });
    check(cancel.status === 200, 'cancelled the winning booking');
    const rebook = await book(listing.id, base, addDays(base, nights), 500);
    check(rebook.status === 201, 'the released nights could be booked again');
    if (rebook.status === 201) created.push(rebook.data);
  } finally {
    // Always clean up, so test holds never linger on the calendar.
    for (const id of blocks) await call(`/admin/blocks/${id}`, { method: 'DELETE', headers: staff });
    for (const booking of created) {
      const { data } = await call(`/admin/bookings?view=all&q=${booking.code}`, { headers: staff });
      const match = data.items.find((item) => item.code === booking.code && ['CONFIRMED', 'PENDING_PAYMENT'].includes(item.status));
      if (match) await call(`/admin/bookings/${match.id}/cancel`, { method: 'POST', headers: staff, body: { reason: 'race test cleanup', refund: 'none' } });
    }
    console.log(`\nCleaned up ${created.length} test booking(s) and ${blocks.length} block(s).`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
