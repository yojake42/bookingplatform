import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Booking, BookingSource, BookingStatus, HoldKind, ListingStatus, PaymentStatus, Prisma, type Listing } from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../email/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { LegalService } from '../legal/legal';
import { addDays, nightsBetween, toIsoDate } from '../common/dates';
import { isHoldOverlapError, isRetryableTransactionError, isUniqueViolation, lockListingCalendar } from '../common/db-errors';
import { cancellationPolicyText, policyRefund } from '../common/cancellation';
import { quoteStay, validateStay } from '../common/stay';
import { localToday, localTodayIso, zonedDateTimeToUtc, zoneAbbreviation } from '../common/timezone';
import type { AdminBookingsQuery, CreateBookingDto } from './booking.dto';

const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const adminPageSize = 50;

function generateCode() {
  return Array.from({ length: 8 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join('');
}

const unavailableMessage = 'Sorry — those dates were just booked by someone else. Please choose different dates.';

type BookingWithListing = Booking & { listing: Listing };

/** Check-in / checkout *instants* for a booking, in the home's time zone. */
function stayInstants(booking: Booking, listing: Pick<Listing, 'timeZone' | 'checkInTime' | 'checkOutTime'>) {
  return {
    checkInAt: zonedDateTimeToUtc(booking.checkIn, listing.checkInTime, listing.timeZone),
    checkOutAt: zonedDateTimeToUtc(booking.checkOut, listing.checkOutTime, listing.timeZone),
  };
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly legal: LegalService,
  ) {}

  /**
   * Creates a booking and its calendar hold in one transaction. The hold insert is what guarantees
   * exclusivity: if any other request (on any replica) holds an overlapping night, Postgres rejects it
   * and the whole transaction rolls back.
   *
   * Website bookings start as PENDING_PAYMENT (dates held) and get a hosted checkout URL; they confirm
   * when the payment provider reports success. Staff bookings are confirmed immediately (paid offline).
   */
  async create(dto: CreateBookingDto, options: { source: BookingSource; createdById?: string }): Promise<{ booking: Booking; checkoutUrl: string | null }> {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return { booking: existing, checkoutUrl: await this.pendingCheckoutUrl(existing) };
    }

    const website = options.source === BookingSource.WEBSITE;
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    const bookable = listing && (website ? listing.status === ListingStatus.PUBLISHED : listing.status !== ListingStatus.ARCHIVED);
    if (!listing || !bookable) throw new NotFoundException('This home is not available for booking.');
    if (website && !dto.acceptTerms) throw new BadRequestException('Please accept the Terms of Service and Privacy Policy to book.');

    const result = validateStay(listing, dto, { enforceNightLimits: website, today: localToday(listing.timeZone) });
    if (!result.ok) throw new BadRequestException(result.message);
    const { checkIn, checkOut, nights } = result.stay;
    const quote = quoteStay(listing, nights);
    const legal = website ? await this.legal.currentIds() : { termsVersionId: null, privacyVersionId: null };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          await lockListingCalendar(tx, listing.id);
          const booking = await tx.booking.create({
            data: {
              code: generateCode(),
              manageToken: randomBytes(24).toString('base64url'),
              idempotencyKey: dto.idempotencyKey,
              listingId: listing.id,
              status: website ? BookingStatus.PENDING_PAYMENT : BookingStatus.CONFIRMED,
              confirmedAt: website ? null : new Date(),
              source: options.source,
              checkIn,
              checkOut,
              nights,
              guests: dto.guests,
              guestName: dto.guestName,
              guestEmail: dto.guestEmail.toLowerCase(),
              guestPhone: dto.guestPhone ?? '',
              message: dto.message?.trim() ?? '',
              nightlyPrice: quote.nightlyPrice,
              cleaningFee: quote.cleaningFee,
              totalPrice: quote.total,
              currency: quote.currency,
              createdById: options.createdById,
              ...legal,
            },
          });
          await tx.calendarHold.create({
            data: { listingId: listing.id, kind: HoldKind.BOOKING, startDate: checkIn, endDate: checkOut, bookingId: booking.id, createdById: options.createdById },
          });
          const payment = website
            ? await tx.payment.create({
                data: {
                  bookingId: booking.id,
                  provider: this.payments.provider.name,
                  amount: quote.total,
                  currency: quote.currency,
                  expiresAt: new Date(Date.now() + this.payments.holdMinutes * 60_000),
                },
              })
            : null;
          if (!website) await this.notifications.bookingConfirmed(tx, booking.id, null);
          return { booking, payment };
        });

        if (!created.payment) {
          this.notifications.flush();
          return { booking: created.booking, checkoutUrl: null };
        }
        // Outside the transaction: never hold a database transaction open across a network call.
        const checkoutUrl = await this.payments.openCheckout(created.payment.id);
        return { booking: created.booking, checkoutUrl };
      } catch (error) {
        if (isHoldOverlapError(error)) throw new ConflictException(unavailableMessage);
        if (dto.idempotencyKey && isUniqueViolation(error, 'idempotencyKey')) {
          // A concurrent retry of the same checkout won; hand back its booking.
          const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
          if (existing) return { booking: existing, checkoutUrl: await this.pendingCheckoutUrl(existing) };
        }
        if (isUniqueViolation(error, 'code') || isRetryableTransactionError(error)) continue;
        throw error;
      }
    }
    throw new ConflictException('Could not create the booking. Please try again.');
  }

  private async pendingCheckoutUrl(booking: Booking) {
    if (booking.status !== BookingStatus.PENDING_PAYMENT) return null;
    const payment = await this.prisma.payment.findFirst({ where: { bookingId: booking.id, status: PaymentStatus.PENDING }, orderBy: { createdAt: 'desc' } });
    return payment?.checkoutUrl ?? null;
  }

  // -------------------------------------------------------------------------
  // Cancellation & refunds
  // -------------------------------------------------------------------------

  /** What the cancellation policy would refund right now. */
  async refundPreview(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
    if (!booking) throw new NotFoundException('Booking not found.');
    return this.refundPreviewFor(booking);
  }

  private async refundPreviewFor(booking: BookingWithListing) {
    const { available, payment } = await this.payments.refundable(booking.id);
    const paid = payment?.amount ?? 0;
    const { checkInAt } = stayInstants(booking, booking.listing);
    const decision = policyRefund({ policy: booking.listing.cancellationPolicy, paid, checkInAt, bookedAt: booking.confirmedAt ?? booking.createdAt });
    return {
      paid,
      refundable: available,
      policyAmount: Math.min(decision.amount, available),
      percent: decision.percent,
      rule: decision.rule,
      fullRefundUntil: decision.fullRefundUntil,
      policy: booking.listing.cancellationPolicy,
      policyText: cancellationPolicyText[booking.listing.cancellationPolicy],
      currency: booking.currency,
      hasOnlinePayment: Boolean(payment?.providerPaymentId),
    };
  }

  /**
   * Cancels a booking and releases its nights atomically, then refunds. A booking still awaiting
   * payment is simply abandoned (its checkout is closed first).
   */
  async cancel(bookingId: string, actor: { name: string; kind: 'guest' | 'host' }, options: { reason?: string; refund: 'policy' | 'full' | 'none' | 'custom'; refundAmount?: number }) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: true } });
    if (!booking) throw new NotFoundException('Booking not found.');

    if (booking.status === BookingStatus.PENDING_PAYMENT) {
      await this.payments.abandon(booking.id);
      return { refund: null };
    }
    if (booking.status !== BookingStatus.CONFIRMED) throw new ConflictException('This booking is no longer active.');

    const preview = await this.refundPreviewFor(booking);
    const refundAmount = (() => {
      if (!preview.hasOnlinePayment) return 0;
      switch (options.refund) {
        case 'full': return preview.refundable;
        case 'none': return 0;
        case 'custom': return Math.max(0, Math.min(options.refundAmount ?? 0, preview.refundable));
        default: return preview.policyAmount;
      }
    })();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.CONFIRMED },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: actor.name, cancellationReason: options.reason?.trim() ?? '' },
      });
      if (!updated.count) throw new ConflictException('This booking was just cancelled.');
      await tx.calendarHold.deleteMany({ where: { bookingId } });
      await this.notifications.bookingCancelled(tx, bookingId, { refundAmount, cancelledBy: actor.kind, reason: actor.kind === 'host' ? options.reason : undefined });
    });
    this.notifications.flush();

    const refund = refundAmount > 0 ? await this.payments.refund(bookingId, refundAmount, actor.name, options.reason ?? 'Booking cancelled') : null;
    return { refund };
  }

  /** Goodwill/partial refund on a booking without cancelling it. */
  async issueRefund(bookingId: string, amount: number, actorName: string, note?: string) {
    const refund = await this.payments.refund(bookingId, amount, actorName, note ?? '');
    if (refund) {
      await this.notifications.refundIssued(this.prisma, bookingId, amount, note);
      this.notifications.flush();
    }
    return refund;
  }

  // -------------------------------------------------------------------------
  // Guest self-service (authorized by the unguessable manage token)
  // -------------------------------------------------------------------------

  async lookupToken(code: string, email: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { code: code.trim().toUpperCase(), guestEmail: { equals: email.trim(), mode: 'insensitive' } },
      select: { manageToken: true },
    });
    if (!booking) throw new NotFoundException('We could not find a booking with that confirmation code and email.');
    return { token: booking.manageToken };
  }

  async guestView(token: string) {
    let booking = await this.findByToken(token);
    if (booking.status === BookingStatus.PENDING_PAYMENT) {
      await this.payments.reconcile(booking.id);
      booking = await this.findByToken(token);
    }
    const { listing } = booking;
    const now = new Date();
    const { checkInAt, checkOutAt } = stayInstants(booking, listing);
    const cover = listing.media[0];
    const confirmed = booking.status === BookingStatus.CONFIRMED;
    const pendingPayment = booking.status === BookingStatus.PENDING_PAYMENT ? booking.payments.find((payment) => payment.status === PaymentStatus.PENDING) : undefined;
    const payment = await this.payments.summary(booking.id);
    // The street address is shared once the guest has paid (or for confirmed staff bookings).
    const showAddress = confirmed || booking.status === BookingStatus.CANCELLED;

    return {
      code: booking.code,
      status: booking.status,
      checkIn: toIsoDate(booking.checkIn),
      checkOut: toIsoDate(booking.checkOut),
      checkInAt,
      checkOutAt,
      nights: booking.nights,
      guests: booking.guests,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      message: booking.message,
      nightlyPrice: booking.nightlyPrice,
      cleaningFee: booking.cleaningFee,
      totalPrice: booking.totalPrice,
      currency: booking.currency,
      createdAt: booking.createdAt,
      cancelledAt: booking.cancelledAt,
      cancelledBy: booking.cancelledBy === 'Guest' ? 'guest' : booking.cancelledBy ? 'host' : null,
      canCancel: confirmed && now < checkInAt,
      canReview: confirmed && now >= checkOutAt && !booking.review,
      cancellation: confirmed && now < checkInAt ? await this.refundPreviewFor(booking) : null,
      pendingPayment: pendingPayment ? { checkoutUrl: pendingPayment.checkoutUrl, expiresAt: pendingPayment.expiresAt } : null,
      payment: { amountPaid: payment.amountPaid, amountRefunded: payment.amountRefunded, refundPending: payment.refundPending },
      review: booking.review ? { rating: booking.review.rating, comment: booking.review.comment, createdAt: booking.review.createdAt } : null,
      listing: {
        id: listing.id,
        title: listing.title,
        propertyType: listing.propertyType,
        addressLine1: showAddress ? listing.addressLine1 : '',
        addressLine2: showAddress ? listing.addressLine2 : '',
        city: listing.city,
        region: listing.region,
        postalCode: showAddress ? listing.postalCode : '',
        country: listing.country,
        latitude: showAddress ? listing.latitude : null,
        longitude: showAddress ? listing.longitude : null,
        checkInTime: listing.checkInTime,
        checkOutTime: listing.checkOutTime,
        timeZone: listing.timeZone,
        timeZoneLabel: zoneAbbreviation(listing.timeZone, checkInAt),
        houseRules: listing.houseRules,
        cancellationPolicy: listing.cancellationPolicy,
        coverUrl: cover ? this.storage.publicUrl(cover.largeKey ?? cover.storageKey) : null,
      },
    };
  }

  private async findByToken(token: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { manageToken: token },
      include: {
        listing: { include: { media: { where: { kind: 'IMAGE', status: 'READY' }, orderBy: { position: 'asc' }, take: 1 } } },
        review: true,
        payments: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  async cancelAsGuest(token: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { manageToken: token }, include: { listing: true } });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.status === BookingStatus.PENDING_PAYMENT) {
      await this.payments.abandon(booking.id);
      return this.guestView(token);
    }
    if (booking.status !== BookingStatus.CONFIRMED) throw new ConflictException('This booking is already cancelled.');
    if (new Date() >= stayInstants(booking, booking.listing).checkInAt) {
      throw new BadRequestException('This stay has already started. Please contact your host to make changes.');
    }
    await this.cancel(booking.id, { name: 'Guest', kind: 'guest' }, { reason, refund: 'policy' });
    return this.guestView(token);
  }

  async abandonAsGuest(token: string) {
    const booking = await this.prisma.booking.findUnique({ where: { manageToken: token } });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.status === BookingStatus.PENDING_PAYMENT) await this.payments.abandon(booking.id);
    return this.guestView(token);
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  /**
   * Builds a filter where each booking is compared against *its own home's* local date.
   * There are only ever a handful of distinct zones, so this stays a small OR.
   */
  private async perZone(build: (today: Date) => Prisma.BookingWhereInput): Promise<Prisma.BookingWhereInput> {
    const zones = await this.prisma.listing.findMany({ distinct: ['timeZone'], select: { timeZone: true } });
    if (!zones.length) return build(localToday('UTC'));
    return { OR: zones.map(({ timeZone }) => ({ AND: [{ listing: { timeZone } }, build(localToday(timeZone))] })) };
  }

  async adminList(query: AdminBookingsQuery) {
    const view = query.view ?? 'upcoming';
    const and: Prisma.BookingWhereInput[] = [];
    if (view === 'upcoming') and.push({ status: BookingStatus.CONFIRMED }, await this.perZone((today) => ({ checkIn: { gt: today } })));
    if (view === 'current') and.push({ status: BookingStatus.CONFIRMED }, await this.perZone((today) => ({ checkIn: { lte: today }, checkOut: { gt: today } })));
    if (view === 'past') and.push({ status: BookingStatus.CONFIRMED }, await this.perZone((today) => ({ checkOut: { lte: today } })));
    if (view === 'cancelled') and.push({ status: BookingStatus.CANCELLED });
    if (view === 'pending') and.push({ status: { in: [BookingStatus.PENDING_PAYMENT, BookingStatus.EXPIRED] } });
    if (query.listingId) and.push({ listingId: query.listingId });
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [{ code: { contains: q.toUpperCase() } }, { guestName: { contains: q, mode: 'insensitive' } }, { guestEmail: { contains: q, mode: 'insensitive' } }],
      });
    }
    const where: Prisma.BookingWhereInput = { AND: and };
    const ascending = view === 'upcoming' || view === 'current';
    const page = query.page ?? 1;
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: view === 'pending' ? [{ createdAt: 'desc' }] : [{ checkIn: ascending ? 'asc' : 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * adminPageSize,
        take: adminPageSize,
        include: { listing: { select: { id: true, title: true, city: true, timeZone: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: items.map((booking) => this.staffView(booking)), total, page, pageSize: adminPageSize };
  }

  async adminGet(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        listing: { select: { id: true, title: true, city: true, timeZone: true } },
        createdBy: { select: { name: true } },
        review: true,
        termsVersion: { select: { version: true, publishedAt: true } },
        privacyVersion: { select: { version: true, publishedAt: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    const [payment, emails] = await Promise.all([
      this.payments.summary(booking.id),
      this.prisma.emailMessage.findMany({ where: { bookingId: booking.id }, orderBy: { createdAt: 'asc' }, select: { id: true, template: true, toEmail: true, subject: true, status: true, createdAt: true } }),
    ]);
    return {
      ...this.staffView(booking),
      createdBy: booking.createdBy?.name ?? null,
      review: booking.review,
      manageToken: booking.manageToken,
      termsVersion: booking.termsVersion,
      privacyVersion: booking.privacyVersion,
      payment,
      emails,
    };
  }

  async dashboard() {
    const confirmed = BookingStatus.CONFIRMED;
    const listingSelect = { select: { id: true, title: true, city: true, timeZone: true } };
    const [arrivalsWhere, stayingWhere, departingWhere, upcomingWhere] = await Promise.all([
      this.perZone((today) => ({ checkIn: { gte: today, lt: addDays(today, 7) } })),
      this.perZone((today) => ({ checkIn: { lte: today }, checkOut: { gt: today } })),
      this.perZone((today) => ({ checkOut: today })),
      this.perZone((today) => ({ checkIn: { gte: today } })),
    ]);
    const utcToday = localToday('UTC');
    const in30 = addDays(utcToday, 30);

    const [published, drafts, upcoming, arrivals, staying, departingToday, holdsNext30, recent, revenue, pendingPayments] = await Promise.all([
      this.prisma.listing.count({ where: { status: ListingStatus.PUBLISHED } }),
      this.prisma.listing.count({ where: { status: ListingStatus.DRAFT } }),
      this.prisma.booking.count({ where: { AND: [{ status: confirmed }, upcomingWhere] } }),
      this.prisma.booking.findMany({ where: { AND: [{ status: confirmed }, arrivalsWhere] }, orderBy: { checkIn: 'asc' }, take: 10, include: { listing: listingSelect } }),
      this.prisma.booking.count({ where: { AND: [{ status: confirmed }, stayingWhere] } }),
      this.prisma.booking.count({ where: { AND: [{ status: confirmed }, departingWhere] } }),
      this.prisma.calendarHold.findMany({
        where: { kind: HoldKind.BOOKING, startDate: { lt: in30 }, endDate: { gt: utcToday }, listing: { status: ListingStatus.PUBLISHED }, booking: { status: confirmed } },
        select: { startDate: true, endDate: true },
      }),
      this.prisma.booking.findMany({ where: { status: { not: BookingStatus.EXPIRED } }, orderBy: { createdAt: 'desc' }, take: 6, include: { listing: listingSelect } }),
      this.prisma.booking.groupBy({ by: ['currency'], where: { status: confirmed, checkIn: { gte: utcToday, lt: in30 } }, _sum: { totalPrice: true } }),
      this.prisma.booking.count({ where: { status: BookingStatus.PENDING_PAYMENT } }),
    ]);

    const bookedNights = holdsNext30.reduce((sum, hold) => {
      const start = hold.startDate > utcToday ? hold.startDate : utcToday;
      const end = hold.endDate < in30 ? hold.endDate : in30;
      return sum + Math.max(0, nightsBetween(start, end));
    }, 0);

    return {
      listings: { published, drafts },
      upcomingBookings: upcoming,
      guestsStayingNow: staying,
      departingToday,
      pendingPayments,
      occupancyNext30: published ? bookedNights / (published * 30) : 0,
      bookedNightsNext30: bookedNights,
      revenueNext30: revenue.map((row) => ({ currency: row.currency, total: row._sum.totalPrice ?? 0 })),
      arrivals: arrivals.map((booking) => this.staffView(booking)),
      recent: recent.map((booking) => this.staffView(booking)),
    };
  }

  staffView(booking: Booking & { listing?: { id: string; title: string; city: string; timeZone: string } }) {
    return {
      id: booking.id,
      code: booking.code,
      status: booking.status,
      source: booking.source,
      listing: booking.listing,
      listingToday: booking.listing ? localTodayIso(booking.listing.timeZone) : null,
      checkIn: toIsoDate(booking.checkIn),
      checkOut: toIsoDate(booking.checkOut),
      nights: booking.nights,
      guests: booking.guests,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      message: booking.message,
      nightlyPrice: booking.nightlyPrice,
      cleaningFee: booking.cleaningFee,
      totalPrice: booking.totalPrice,
      currency: booking.currency,
      cancelledAt: booking.cancelledAt,
      cancelledBy: booking.cancelledBy,
      cancellationReason: booking.cancellationReason,
      confirmedAt: booking.confirmedAt,
      createdAt: booking.createdAt,
    };
  }
}

