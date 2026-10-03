# Haven — booking platform

A simplified, Airbnb-style booking site for a curated set of homes. Staff manage listings, calendars and bookings; guests search (map + text), book and pay, manage and review their stays.

**Stack:** React 19 + Vite + Tailwind CSS 4 · NestJS 11 · PostgreSQL 17 (Prisma) · S3-compatible storage (Cloudflare R2 in production, MinIO locally) · Stripe (payments) · Brevo (email) · MapLibre + OpenFreeMap tiles · Photon (OSM) geocoding · Docker / Docker Compose · npm workspaces.

## Quick start

```bash
cp .env.example .env          # defaults work as-is
docker compose up --build     # first run installs deps, migrates, seeds demo homes
```

| What | URL |
| --- | --- |
| Website | http://localhost:5180 |
| Staff console | http://localhost:5180/admin — `admin@example.com` / `ChangeMe123!` |
| API | http://localhost:3100/api/health |
| MinIO console | http://localhost:9101 — `minioadmin` / `minioadmin` |
| Postgres | `localhost:5440` — `booking` / `booking` |

Out of the box, development uses a **test payment page** (`PAYMENT_PROVIDER=fake`) and **records emails without sending them** (`EMAIL_PROVIDER=log`; read them under Staff console → Emails). Switch to Stripe and Brevo with the settings below.

Host ports are offset from the defaults so this stack can run alongside other projects. Demo data (`SEED_DEMO_DATA=true`) adds 12 homes with photos, past and upcoming bookings, reviews and blocked dates, plus a second staff account (`maya@example.com`, same password). It only runs when the database has no listings.

```bash
npm test                    # API (Jest) + web (Vitest) unit tests
npm run typecheck
npm run test:double-booking # concurrency proof against the running API (see below)
docker compose down -v      # wipe database + storage
```

## Features

**Guests**
- Search by destination (our own cities/regions plus any geocoded place), dates and guest count; filters for price range, bedrooms, beds, bathrooms, property type and amenities; sorting.
- Split list/map view with price markers, hover sync, "search as I move the map" / "search this area", and a mobile map toggle. Search state lives in the URL, so it's shareable.
- Listing page: photo/video gallery and lightbox, details, amenities, live availability calendar, verified reviews with category scores, location map, house rules, and a sticky booking card with live pricing.
- Checkout → accept Terms & Privacy → pay on the provider's hosted page → private booking page (link + confirmation code) to view details (exact address revealed after payment), cancel with a policy-based refund, and review after checkout. "Find my booking" recovers it with code + email, or emails links to every booking for an address.
- Emails: booking confirmation, cancellation/refund notices, an arrival reminder 3 days out, and a review request the morning after checkout.
- `/terms` and `/privacy` with full version history.

**Staff** (`/admin`)
- Dashboard: guests staying now, upcoming arrivals, unpaid checkouts, 30-day occupancy and booked revenue.
- Listing editor: details, capacity, amenities, pricing and stay rules, cancellation policy, house rules, host, location (address search, draggable pin, *general area* vs *exact* public location, time zone), photos and videos, calendar, reviews.
- Media: bulk upload and drag-and-drop anywhere on the section, per-file progress, 3 parallel uploads, retry, drag-to-reorder, cover photo, captions, delete. Images get WebP display variants; videos (MP4/WebM/MOV up to 1 GB) are served as uploaded.
- Calendar: click the first and last night to block dates (with a note) or add a phone/email booking; bookings awaiting payment are shown separately; click any booking or block to view, cancel or unblock.
- Bookings: upcoming / staying now / past / unpaid / cancelled, payment ledger, refunds (policy, full, none, custom, or a goodwill refund without cancelling), retry failed refunds, the legal versions the guest accepted, and every email sent for the booking.
- Emails: the full outbox with HTML previews, delivery status and resend.
- Legal pages (admins): markdown editor with preview, publish new versions, and a timeline of every version with the period it was in force and how many bookings accepted it.
- Reviews moderation, staff accounts (admins; new staff get a welcome email), and account settings (password change, which signs out other sessions).

## Payments

Bookings go through a provider-agnostic interface (`apps/api/src/payments/payment-provider.ts`): hosted checkout, query/expire a checkout, refund, and signed webhooks normalized into a few events. Stripe is the production implementation (`stripe.provider.ts`); a `fake` provider powers local development. To add another provider, implement `PaymentProvider` and register it in `payments.module.ts`.

**Lifecycle**
1. The guest submits checkout → the booking is created as `PENDING_PAYMENT` and **its nights are held immediately** (same exclusion constraint as confirmed bookings), so nobody can pay for dates someone else is paying for.
2. The guest is redirected to the provider's hosted page. The hold lasts `PAYMENT_HOLD_MINUTES` (default 30, matching Stripe's minimum checkout lifetime).
3. Payment success (webhook, or the API asking the provider directly when the guest returns) → `CONFIRMED`, confirmation emails queued in the same transaction.
4. If the window lapses or the guest releases the dates → the checkout is **expired at the provider first**, then the booking becomes `EXPIRED` and the nights are released. Because the checkout is closed before the dates are freed, a payment can't arrive for dates that were given away; if a provider ever ignores that, the booking is re-held if still free or refunded in full.

**Refunds** follow the listing's cancellation policy, measured against the check-in time in the home's time zone (Flexible: full until 24h before; Moderate: full until 5 days, then 50%; Strict: full within 48h of booking if 14+ days out, 50% until 7 days, then none). Staff can override (full / none / custom) or issue goodwill refunds. Refund amounts are reserved with an atomic update, so concurrent refunds can never exceed what was paid; failed refunds are flagged for retry.

**Stripe setup**
1. `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_...`
2. Add a webhook endpoint at `https://<your-domain>/api/payments/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Locally: `stripe listen --forward-to localhost:3100/api/payments/webhooks/stripe` and use the printed `whsec_...`. (Without webhooks, confirmation still works when the guest returns to the site, because the API reconciles with Stripe directly.)

Webhooks may arrive more than once and on any replica; they're de-duplicated by event id and every state change is conditional, so processing is idempotent. The `fake` provider refuses to start with `NODE_ENV=production` unless `ALLOW_FAKE_PAYMENTS=true`.

## Email

All email goes through an outbox table. Emails are written in the same transaction as the event that causes them (no "booking saved but email lost"), then delivered by a worker that claims rows with `FOR UPDATE SKIP LOCKED`, so every replica can send without duplicates. Failures retry with backoff (1m, 5m, 15m, 1h, 4h); invalid recipients fail immediately. Scheduled emails (reminders, review requests) claim each booking with a conditional update, so they're sent exactly once.

Providers implement `EmailProvider` (`apps/api/src/email/email-provider.ts`): `brevo` (transactional API) and `log` (development). Configure:

```
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-...
EMAIL_FROM_ADDRESS=stays@yourdomain.com   # must be a verified sender/domain in Brevo
EMAIL_FROM_NAME=Haven
EMAIL_REPLY_TO=help@yourdomain.com        # optional
STAFF_NOTIFICATION_EMAILS=a@x.com,b@x.com # optional; defaults to all active admins
PUBLIC_WEB_URL=https://yourdomain.com     # used for links in emails and payment redirects
```

## Time zones

Every listing has an IANA time zone, detected automatically from its map pin (offline lookup) and adjustable in the editor. It determines:
- **"Today"** for that home: the earliest bookable night, the calendar's past days, and the staff views (arriving, staying now, completed).
- Exact **check-in/checkout moments** (date + listing time in the home's zone, DST-aware), used for cancellation and refund deadlines, when guests can cancel, and when they can review.
- Emails and booking pages show times with the home's zone (e.g. "after 3:00 PM PST").

## Terms & Privacy

Versions are append-only: publishing creates version N+1, in force from that moment until the next version. Guests must accept both documents to book, and each booking records the exact versions accepted. Older versions stay readable at `/terms?version=N`. Version 1 is seeded from a template; replace it with reviewed text from Staff console → Legal pages.

## How double bookings are prevented

Every unavailable night belongs to exactly one row in `CalendarHold`: a booking's hold (paid or awaiting payment) or a staff block. Postgres enforces this with an exclusion constraint (in the init migration):

```sql
EXCLUDE USING gist ("listingId" WITH =, daterange("startDate", "endDate", '[)') WITH &&)
```

- A booking and its hold are inserted in **one transaction**. If any other request, on any replica, already holds an overlapping night, Postgres rejects the insert and the whole booking rolls back. The guest gets a friendly 409.
- Calendar writes for a listing take a transaction-scoped advisory lock first, so simultaneous conflicting requests queue rather than deadlock: one wins, the rest get a clean 409.
- Ranges are half-open (`[check-in, checkout)`), so a checkout day can be the next guest's check-in day.
- Blocks use the same table, so they can't overlap bookings, and bookings can't land on blocks.
- **Cancelling** (or a checkout expiring) deletes the hold in the same transaction as the status change, which releases the nights immediately.
- Checkout sends an idempotency key, so double-clicks and network retries return the same booking.

`npm run test:double-booking` exercises all of this against the live API: 15 simultaneous requests for the same nights (exactly 1 wins), mutually overlapping ranges, back-to-back stays, idempotent retries, block vs booking, and rebooking after a cancellation.

## Multi-replica readiness

The API is stateless; run as many replicas as you like:
- Sessions, rate limits (login, booking, lookup, geocoding), booking exclusivity, the email outbox and webhook de-duplication all live in Postgres.
- Uploads go **directly from the browser to R2/MinIO** via presigned URLs, so no replica buffers files or needs a disk.
- Background jobs (expired checkouts, email delivery, reminders, cleanup) run on every replica and coordinate through row claims and advisory locks.
- Migrations and seeding run in a one-shot `migrate` job before replicas start (production compose).

Try it locally with two API replicas behind nginx:

```bash
cp .env.prod.example .env.prod
npm run prod:up                                  # http://localhost:8080
API_URL=http://localhost:8080/api npm run test:double-booking
```

## Configuration notes

- **Cloudflare R2**: set `STORAGE_ENDPOINT` / `STORAGE_PUBLIC_ENDPOINT` to `https://<account>.r2.cloudflarestorage.com`, `STORAGE_REGION=auto`, `STORAGE_FORCE_PATH_STYLE=false`, and API-token keys. Enable public access (or a custom domain) and put it in `STORAGE_PUBLIC_BASE_URL`; leave that empty to serve media through short-lived signed URLs instead. Add a bucket **CORS rule** allowing `PUT` from your site's origin with the `Content-Type` header, which browser uploads need.
- **Maps** use OpenFreeMap vector tiles (free, no key). Override with `VITE_MAP_STYLE_URL` / `VITE_MAP_DETAIL_STYLE_URL` at build time.
- **Geocoding** uses the public Photon instance (fair-use). For production traffic, self-host Photon or point `GEOCODER_URL` at a compatible provider.
- Run behind HTTPS in production with `COOKIE_SECURE=true` and `TRUST_PROXY=true`.

## Project layout

```
apps/api      NestJS API (prisma/ holds schema, migrations, seed)
  src/payments   provider interface, Stripe + fake providers, booking/payment lifecycle, webhooks
  src/email      provider interface, Brevo + log providers, outbox worker, templates, notifications
  src/legal      versioned Terms/Privacy
apps/web      React SPA (served by nginx in production, proxying /api)
scripts/      double-booking race test
docker-compose.yml        dev stack (hot reload)
docker-compose.prod.yml   production-shaped stack (2 API replicas + nginx)
```
