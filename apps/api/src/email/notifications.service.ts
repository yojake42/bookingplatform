import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus, Prisma, UserRole, type Booking, type Listing } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cancellationPolicyText } from '../common/cancellation';
import { addDays, nightsBetween } from '../common/dates';
import { localToday } from '../common/timezone';
import { EmailService } from './email.service';
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingLinksEmail,
  refundIssuedEmail,
  reviewRequestEmail,
  staffBookingEmail,
  staffWelcomeEmail,
  stayReminderEmail,
  type Rendered,
  type StayInfo,
} from './templates';

type Db = PrismaService | Prisma.TransactionClient;
type BookingWithListing = Booking & { listing: Listing };

/** Turns domain events into emails in the outbox. Callers pass their transaction so emails commit atomically. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  get webUrl() {
    return (this.config.get<string>('PUBLIC_WEB_URL') || this.config.get<string>('WEB_ORIGIN', 'http://localhost:5180')).replace(/\/+$/, '');
  }

  tripUrl(token: string) {
    return `${this.webUrl}/trips/${token}`;
  }

  /** Call after the surrounding transaction commits. */
  flush() {
    this.email.flush();
  }

  async bookingConfirmed(db: Db, bookingId: string, amountPaid: number | null) {
    const booking = await this.load(db, bookingId);
    const stay = this.stay(booking);
    await this.guest(db, booking, 'booking_confirmed', bookingConfirmedEmail({ ...stay, amountPaid, cancellationPolicy: cancellationPolicyText[booking.listing.cancellationPolicy] }));
    await this.staff(db, booking, 'staff_new_booking', staffBookingEmail({ ...stay, kind: 'new', adminUrl: this.adminUrl(booking.id), guestEmail: booking.guestEmail }));
  }

  async bookingCancelled(db: Db, bookingId: string, details: { refundAmount: number; cancelledBy: 'guest' | 'host'; reason?: string }) {
    const booking = await this.load(db, bookingId);
    const stay = this.stay(booking);
    await this.guest(db, booking, 'booking_cancelled', bookingCancelledEmail({ ...stay, ...details }));
    await this.staff(db, booking, 'staff_booking_cancelled', staffBookingEmail({ ...stay, kind: 'cancelled', adminUrl: this.adminUrl(booking.id), guestEmail: booking.guestEmail, refundAmount: details.refundAmount }));
  }

  async refundIssued(db: Db, bookingId: string, amount: number, note?: string) {
    const booking = await this.load(db, bookingId);
    await this.guest(db, booking, 'refund_issued', refundIssuedEmail({ ...this.stay(booking), amount, note }));
  }

  /** "Email me my bookings": sends links for every booking made with this address. Silent if none. */
  async sendBookingLinks(emailAddress: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { guestEmail: { equals: emailAddress.trim(), mode: 'insensitive' }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.PENDING_PAYMENT] } },
      orderBy: { checkIn: 'desc' },
      take: 20,
      include: { listing: { select: { title: true } } },
    });
    if (!bookings.length) return;
    const rendered = bookingLinksEmail({
      trips: bookings.map((booking) => ({
        title: booking.listing.title,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        code: booking.code,
        status: booking.status === 'PENDING_PAYMENT' ? 'awaiting payment' : booking.status.toLowerCase(),
        url: this.tripUrl(booking.manageToken),
      })),
    });
    await this.email.enqueue(this.prisma, { template: 'booking_links', to: { email: bookings[0].guestEmail, name: bookings[0].guestName }, ...rendered });
    this.flush();
  }

  async staffWelcome(user: { name: string; email: string }, invitedBy: string) {
    const rendered = staffWelcomeEmail({ name: user.name, email: user.email, invitedBy, loginUrl: `${this.webUrl}/login` });
    await this.email.enqueue(this.prisma, { template: 'staff_welcome', to: { email: user.email, name: user.name }, ...rendered });
    this.flush();
  }

  // -------------------------------------------------------------------------
  // Scheduled guest emails. Each booking is claimed with a conditional update in the same transaction
  // as the enqueue, so replicas running the same job concurrently can never double-send.
  // -------------------------------------------------------------------------

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendScheduled() {
    try {
      await this.sendStayReminders();
      await this.sendReviewRequests();
    } catch (error) {
      this.logger.error(`Scheduled emails failed: ${(error as Error).message}`);
    }
  }

  async sendStayReminders(now = new Date()) {
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        reminderSentAt: null,
        checkIn: { gte: addDays(now, -1), lte: addDays(now, 4) },
        confirmedAt: { lt: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      },
      include: { listing: true },
    });
    for (const booking of candidates) {
      const daysOut = nightsBetween(localToday(booking.listing.timeZone, now), booking.checkIn);
      if (daysOut < 0 || daysOut > 3) continue;
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.booking.updateMany({ where: { id: booking.id, reminderSentAt: null }, data: { reminderSentAt: now } });
        if (!claimed.count) return;
        await this.guest(tx, booking, 'stay_reminder', stayReminderEmail({ ...this.stay(booking), houseRules: booking.listing.houseRules }));
      });
    }
    this.flush();
  }

  async sendReviewRequests(now = new Date()) {
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        reviewRequestSentAt: null,
        review: null,
        checkOut: { gte: addDays(now, -14), lte: now },
      },
      include: { listing: true },
    });
    for (const booking of candidates) {
      // The morning after checkout, local to the home.
      if (localToday(booking.listing.timeZone, now) <= booking.checkOut) continue;
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.booking.updateMany({ where: { id: booking.id, reviewRequestSentAt: null }, data: { reviewRequestSentAt: now } });
        if (!claimed.count) return;
        await this.guest(tx, booking, 'review_request', reviewRequestEmail(this.stay(booking)));
      });
    }
    this.flush();
  }

  // -------------------------------------------------------------------------

  private async load(db: Db, bookingId: string): Promise<BookingWithListing> {
    return db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { listing: true } });
  }

  private stay(booking: BookingWithListing): StayInfo {
    const listing = booking.listing;
    return {
      code: booking.code,
      guestName: booking.guestName,
      guests: booking.guests,
      nights: booking.nights,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalPrice: booking.totalPrice,
      currency: booking.currency,
      tripUrl: this.tripUrl(booking.manageToken),
      listing: {
        title: listing.title,
        city: listing.city,
        region: listing.region,
        timeZone: listing.timeZone,
        checkInTime: listing.checkInTime,
        checkOutTime: listing.checkOutTime,
        address: [listing.addressLine1, listing.addressLine2, listing.city, [listing.region, listing.postalCode].filter(Boolean).join(' '), listing.country].filter(Boolean).join(', '),
      },
    };
  }

  private adminUrl(bookingId: string) {
    return `${this.webUrl}/admin/bookings?booking=${bookingId}`;
  }

  private guest(db: Db, booking: Booking, template: string, rendered: Rendered) {
    return this.email.enqueue(db, { template, to: { email: booking.guestEmail, name: booking.guestName }, bookingId: booking.id, ...rendered });
  }

  private async staff(db: Db, booking: Booking, template: string, rendered: Rendered) {
    for (const recipient of await this.staffRecipients(db)) {
      await this.email.enqueue(db, { template, to: recipient, bookingId: booking.id, ...rendered });
    }
  }

  /** STAFF_NOTIFICATION_EMAILS if set, otherwise every active admin. */
  private async staffRecipients(db: Db) {
    const configured = (this.config.get<string>('STAFF_NOTIFICATION_EMAILS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (configured.length) return configured.map((email) => ({ email }));
    const admins = await db.user.findMany({ where: { role: UserRole.ADMIN, isActive: true }, select: { email: true, name: true } });
    return admins;
  }
}
