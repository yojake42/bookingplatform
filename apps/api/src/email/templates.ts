/**
 * Transactional email templates. Each returns subject + HTML + plain text. HTML uses inline styles
 * and tables so it renders consistently across mail clients. All dynamic values are escaped.
 */
import { zonedDateTimeToUtc, zoneAbbreviation } from '../common/timezone';

export type Rendered = { subject: string; html: string; text: string };

const brand = { name: 'Haven', color: '#224a3d', accent: '#b07f2c', ink: '#1c1a17', muted: '#7c7264', line: '#e2dbcf', paper: '#faf7f2' };
const serif = "Georgia,'Times New Roman',serif";

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

/** "Tue, Nov 10, 2026" for a calendar date (stored as UTC midnight). */
export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/** "3:00 PM PST" — a wall-clock time at the home on a given date. */
export function formatLocalTime(date: Date, time: string, zone: string) {
  const instant = zonedDateTimeToUtc(date, time, zone);
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(instant);
  return `${clock} ${zoneAbbreviation(zone, instant)}`;
}

function layout(options: { preheader: string; heading: string; body: string; footerNote?: string }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:${brand.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${brand.ink};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.paper};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 8px 20px;">
  <div style="font-family:${serif};font-size:28px;color:${brand.color};letter-spacing:-0.3px;">Haven</div>
  <div style="width:28px;height:2px;background:${brand.accent};margin-top:6px;"></div>
</td></tr>
<tr><td style="background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid ${brand.line};">
  <h1 style="margin:0 0 16px;font-family:${serif};font-weight:normal;font-size:28px;line-height:1.2;color:${brand.ink};">${escapeHtml(options.heading)}</h1>
  ${options.body}
</td></tr>
<tr><td style="padding:20px 8px;font-size:12px;line-height:1.6;color:${brand.muted};text-align:center;">
  ${options.footerNote ? `${options.footerNote}<br>` : ''}You're receiving this because of a booking or account with ${brand.name}.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#453f37;">${html}</p>`;

function button(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:${brand.color};">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;letter-spacing:0.3px;color:${brand.paper};text-decoration:none;border-radius:8px;">${escapeHtml(label)} &rarr;</a>
</td></tr></table>`;
}

function rows(items: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid ${brand.line};">
${items
  .map(
    ([label, value]) => `<tr>
  <td style="padding:12px 0;border-bottom:1px solid ${brand.line};font-size:14px;color:${brand.muted};">${escapeHtml(label)}</td>
  <td style="padding:12px 0;border-bottom:1px solid ${brand.line};font-size:14px;font-weight:600;text-align:right;">${value}</td>
</tr>`,
  )
  .join('')}
</table>`;
}

const textRows = (items: [string, string][]) => items.map(([label, value]) => `${label}: ${value.replace(/<[^>]+>/g, '')}`).join('\n');

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type StayInfo = {
  code: string;
  guestName: string;
  guests: number;
  nights: number;
  checkIn: Date;
  checkOut: Date;
  totalPrice: number;
  currency: string;
  listing: {
    title: string;
    city: string;
    region: string;
    timeZone: string;
    checkInTime: string;
    checkOutTime: string;
    address: string;
  };
  tripUrl: string;
};

function stayRows(stay: StayInfo, options: { address?: boolean } = {}): [string, string][] {
  const items: [string, string][] = [
    ['Confirmation code', `<span style="font-family:Menlo,monospace;letter-spacing:1px;">${escapeHtml(stay.code)}</span>`],
    ['Check-in', `${escapeHtml(formatDate(stay.checkIn))} · after ${escapeHtml(formatLocalTime(stay.checkIn, stay.listing.checkInTime, stay.listing.timeZone))}`],
    ['Checkout', `${escapeHtml(formatDate(stay.checkOut))} · by ${escapeHtml(formatLocalTime(stay.checkOut, stay.listing.checkOutTime, stay.listing.timeZone))}`],
    ['Guests', `${stay.guests} · ${stay.nights} night${stay.nights === 1 ? '' : 's'}`],
  ];
  if (options.address && stay.listing.address) items.push(['Address', escapeHtml(stay.listing.address)]);
  return items;
}

// ---------------------------------------------------------------------------
// Guest emails
// ---------------------------------------------------------------------------

export function bookingConfirmedEmail(stay: StayInfo & { amountPaid: number | null; cancellationPolicy: string }): Rendered {
  const first = stay.guestName.split(' ')[0];
  const items = stayRows(stay, { address: true });
  items.push([stay.amountPaid != null ? 'Total paid' : 'Total', escapeHtml(formatMoney(stay.amountPaid ?? stay.totalPrice, stay.currency))]);
  return {
    subject: `You're booked! ${stay.listing.title} · ${formatDate(stay.checkIn)}`,
    html: layout({
      preheader: `Your stay in ${stay.listing.city} is confirmed. Confirmation code ${stay.code}.`,
      heading: `You're going to ${stay.listing.city || stay.listing.title}, ${first}!`,
      body:
        p(`Your reservation at <b>${escapeHtml(stay.listing.title)}</b> is confirmed. Everything you need is below and on your booking page.`) +
        rows(items) +
        button(stay.tripUrl, 'View your booking') +
        p(`<b>Cancellation policy.</b> ${escapeHtml(stay.cancellationPolicy)}`),
      footerNote: 'Times are local to the home.',
    }),
    text: `You're booked, ${first}!\n\n${stay.listing.title}\n${textRows(items)}\n\nView your booking: ${stay.tripUrl}\n\nCancellation policy: ${stay.cancellationPolicy}`,
  };
}

export function bookingCancelledEmail(stay: StayInfo & { refundAmount: number; cancelledBy: 'guest' | 'host'; reason?: string }): Rendered {
  const refundLine =
    stay.refundAmount > 0
      ? `A refund of <b>${escapeHtml(formatMoney(stay.refundAmount, stay.currency))}</b> is on its way to your original payment method. It usually appears within 5–10 business days.`
      : 'No refund applies to this cancellation under the booking’s cancellation policy.';
  const intro =
    stay.cancelledBy === 'guest'
      ? `Your reservation at <b>${escapeHtml(stay.listing.title)}</b> has been cancelled as requested.`
      : `We're sorry — your reservation at <b>${escapeHtml(stay.listing.title)}</b> has been cancelled by the host.${stay.reason ? ` Reason: ${escapeHtml(stay.reason)}` : ''}`;
  return {
    subject: `Booking cancelled · ${stay.listing.title}`,
    html: layout({
      preheader: `Booking ${stay.code} has been cancelled.`,
      heading: 'Your booking has been cancelled',
      body: p(intro) + rows(stayRows(stay)) + p(refundLine) + button(stay.tripUrl, 'View booking details'),
    }),
    text: `Your booking has been cancelled.\n\n${stay.listing.title}\n${textRows(stayRows(stay))}\n\n${refundLine.replace(/<[^>]+>/g, '')}\n\n${stay.tripUrl}`,
  };
}

export function refundIssuedEmail(stay: StayInfo & { amount: number; note?: string }): Rendered {
  const line = `We've issued a refund of <b>${escapeHtml(formatMoney(stay.amount, stay.currency))}</b> for your stay at <b>${escapeHtml(stay.listing.title)}</b>. It usually appears within 5–10 business days.`;
  return {
    subject: `Refund issued · ${stay.listing.title}`,
    html: layout({
      preheader: `A refund of ${formatMoney(stay.amount, stay.currency)} is on its way.`,
      heading: 'A refund is on its way',
      body: p(line) + (stay.note ? p(escapeHtml(stay.note)) : '') + button(stay.tripUrl, 'View booking'),
    }),
    text: `${line.replace(/<[^>]+>/g, '')}\n${stay.note ?? ''}\n\n${stay.tripUrl}`,
  };
}

export function stayReminderEmail(stay: StayInfo & { houseRules: string }): Rendered {
  const first = stay.guestName.split(' ')[0];
  const rules = stay.houseRules.split('\n').map((rule) => rule.trim()).filter(Boolean);
  return {
    subject: `Your stay at ${stay.listing.title} is coming up`,
    html: layout({
      preheader: `Check-in is ${formatDate(stay.checkIn)}. Here's what you need.`,
      heading: `Almost time, ${first}`,
      body:
        p(`Your trip to <b>${escapeHtml(stay.listing.city)}</b> is just around the corner. Here are your arrival details.`) +
        rows(stayRows(stay, { address: true })) +
        (rules.length
          ? `<p style="margin:0 0 8px;font-size:15px;font-weight:700;">House rules</p><ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7;color:#453f37;">${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>`
          : '') +
        button(stay.tripUrl, 'View booking & map'),
      footerNote: 'Times are local to the home.',
    }),
    text: `Almost time, ${first}!\n\n${textRows(stayRows(stay, { address: true }))}\n\n${rules.map((rule) => `- ${rule}`).join('\n')}\n\n${stay.tripUrl}`,
  };
}

export function reviewRequestEmail(stay: StayInfo): Rendered {
  const first = stay.guestName.split(' ')[0];
  return {
    subject: `How was ${stay.listing.title}?`,
    html: layout({
      preheader: 'Share a quick review of your stay.',
      heading: `How was your stay, ${first}?`,
      body:
        p(`Thanks for staying at <b>${escapeHtml(stay.listing.title)}</b>. A short review helps future guests and means a lot to your host.`) +
        button(`${stay.tripUrl}#review`, 'Leave a review'),
    }),
    text: `How was your stay, ${first}?\n\nLeave a review: ${stay.tripUrl}#review`,
  };
}

export function bookingLinksEmail(input: { trips: { title: string; checkIn: Date; checkOut: Date; code: string; url: string; status: string }[] }): Rendered {
  const list = input.trips
    .map(
      (trip) =>
        `<tr><td style="padding:12px 0;border-bottom:1px solid ${brand.line};font-size:14px;"><a href="${escapeHtml(trip.url)}" style="color:${brand.ink};font-weight:700;">${escapeHtml(trip.title)}</a><br><span style="color:${brand.muted};">${escapeHtml(formatDate(trip.checkIn))} – ${escapeHtml(formatDate(trip.checkOut))} · ${escapeHtml(trip.code)} · ${escapeHtml(trip.status)}</span></td></tr>`,
    )
    .join('');
  return {
    subject: 'Your Haven bookings',
    html: layout({
      preheader: 'Links to manage your bookings.',
      heading: 'Your bookings',
      body: p('Here are the bookings made with this email address. Each link opens the booking page, where you can see details or make changes.') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${brand.line};margin-bottom:16px;">${list}</table>`,
      footerNote: "If you didn't ask for this, you can ignore this email.",
    }),
    text: `Your bookings:\n\n${input.trips.map((trip) => `${trip.title} (${trip.code}, ${trip.status}): ${trip.url}`).join('\n')}`,
  };
}

// ---------------------------------------------------------------------------
// Staff emails
// ---------------------------------------------------------------------------

export function staffBookingEmail(stay: StayInfo & { kind: 'new' | 'cancelled'; adminUrl: string; guestEmail: string; refundAmount?: number }): Rendered {
  const isNew = stay.kind === 'new';
  const items = stayRows(stay);
  items.unshift(['Guest', `${escapeHtml(stay.guestName)} · ${escapeHtml(stay.guestEmail)}`]);
  items.push(['Total', escapeHtml(formatMoney(stay.totalPrice, stay.currency))]);
  if (!isNew && stay.refundAmount) items.push(['Refund', escapeHtml(formatMoney(stay.refundAmount, stay.currency))]);
  return {
    subject: `${isNew ? 'New booking' : 'Cancelled'}: ${stay.listing.title} · ${formatDate(stay.checkIn)}`,
    html: layout({
      preheader: `${stay.guestName} · ${stay.nights} nights`,
      heading: isNew ? 'New booking' : 'Booking cancelled',
      body: p(`<b>${escapeHtml(stay.listing.title)}</b>`) + rows(items) + button(stay.adminUrl, 'Open in staff console'),
    }),
    text: `${isNew ? 'New booking' : 'Booking cancelled'}: ${stay.listing.title}\n${textRows(items)}\n\n${stay.adminUrl}`,
  };
}

export function staffWelcomeEmail(input: { name: string; email: string; loginUrl: string; invitedBy: string }): Rendered {
  return {
    subject: `${input.invitedBy} added you to Haven`,
    html: layout({
      preheader: 'Your staff account is ready.',
      heading: `Welcome, ${input.name.split(' ')[0]}`,
      body:
        p(`${escapeHtml(input.invitedBy)} created a staff account for you. Sign in with <b>${escapeHtml(input.email)}</b> and the temporary password they share with you, then change it under Account settings.`) +
        button(input.loginUrl, 'Sign in'),
    }),
    text: `${input.invitedBy} created a Haven staff account for you (${input.email}). Sign in: ${input.loginUrl}`,
  };
}
