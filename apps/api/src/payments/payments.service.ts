import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus, HoldKind, PaymentStatus, RefundStatus, type Refund } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../email/notifications.service';
import { isHoldOverlapError, lockListingCalendar } from '../common/db-errors';
import { PAYMENT_PROVIDER, type PaymentEvent, type PaymentProvider } from './payment-provider';

const reconcileThrottleMs = 3_000;
const expiryGraceMs = 60_000;

/**
 * Booking ↔ payment lifecycle, independent of the payment provider.
 *
 *   PENDING_PAYMENT booking (dates held) ──paid──▶ CONFIRMED
 *                                       └─expired/abandoned──▶ EXPIRED (hold released)
 *
 * Every transition is a conditional update ("only if still in state X"), so webhooks, the guest's
 * return-to-site reconciliation and the expiry sweep can all race on any replica without harm.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) readonly provider: PaymentProvider,
  ) {}

  get holdMinutes() {
    return Math.min(24 * 60, Math.max(30, Number(this.config.get<string>('PAYMENT_HOLD_MINUTES', '30')) || 30));
  }

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  /** Opens the provider's hosted checkout for a payment row. If that fails the dates are released. */
  async openCheckout(paymentId: string): Promise<string> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { booking: { include: { listing: { include: { media: { where: { kind: 'IMAGE', status: 'READY' }, orderBy: { position: 'asc' }, take: 1 } } } } } },
    });
    if (payment.checkoutUrl) return payment.checkoutUrl;
    const { booking } = payment;
    const { listing } = booking;
    const cover = listing.media[0];
    const tripUrl = this.notifications.tripUrl(booking.manageToken);
    const stayLabel = `${booking.nights} night${booking.nights === 1 ? '' : 's'} · ${booking.guests} guest${booking.guests === 1 ? '' : 's'}`;
    try {
      const session = await this.provider.createCheckout({
        reference: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        customerEmail: booking.guestEmail,
        description: `${listing.title} · ${booking.code}`,
        lineItems: [
          {
            name: listing.title,
            description: `${booking.checkIn.toISOString().slice(0, 10)} to ${booking.checkOut.toISOString().slice(0, 10)} · ${stayLabel}`,
            unitAmount: booking.nightlyPrice,
            quantity: booking.nights,
            imageUrl: cover ? this.storage.publicUrl(cover.thumbKey ?? cover.storageKey) : undefined,
          },
          ...(booking.cleaningFee > 0 ? [{ name: 'Cleaning fee', unitAmount: booking.cleaningFee, quantity: 1 }] : []),
        ],
        successUrl: `${tripUrl}?payment=success`,
        cancelUrl: `${tripUrl}?payment=cancelled`,
        expiresAt: payment.expiresAt,
        metadata: { bookingId: booking.id, paymentId: payment.id, bookingCode: booking.code },
      });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { providerSessionId: session.sessionId, checkoutUrl: session.url } });
      return session.url;
    } catch (error) {
      this.logger.error(`Could not open checkout for payment ${payment.id}: ${(error as Error).message}`);
      await this.releaseUnpaid(payment.id, PaymentStatus.FAILED);
      throw new ServiceUnavailableException('We could not start the payment, so your dates were released. Please try again in a moment.');
    }
  }

  /** Guest returned from checkout, or is waiting on the booking page: ask the provider directly instead of waiting for the webhook. */
  async reconcile(bookingId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { bookingId, status: PaymentStatus.PENDING }, orderBy: { createdAt: 'desc' } });
    if (!payment?.providerSessionId) return;
    const throttle = await this.prisma.payment.updateMany({
      where: { id: payment.id, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - reconcileThrottleMs) } }] },
      data: { lastCheckedAt: new Date() },
    });
    if (!throttle.count) return;
    try {
      if (payment.expiresAt.getTime() < Date.now() - expiryGraceMs) {
        await this.expireUnpaid(payment.id);
        return;
      }
      const state = await this.provider.getCheckout(payment.providerSessionId);
      if (state.status === 'paid') await this.markPaid(payment.providerSessionId, state.providerPaymentId, state.amount);
      if (state.status === 'expired') await this.releaseUnpaid(payment.id, PaymentStatus.CANCELED);
    } catch (error) {
      this.logger.warn(`Reconcile failed for payment ${payment.id}: ${(error as Error).message}`);
    }
  }

  /** Guest backed out of checkout and chose to give up the dates. */
  async abandon(bookingId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { bookingId, status: PaymentStatus.PENDING }, orderBy: { createdAt: 'desc' } });
    if (!payment) return;
    await this.expireUnpaid(payment.id);
  }

  /** Releases dates for unpaid checkouts past their window. Runs on every replica; transitions are idempotent. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepExpired() {
    const due = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.PENDING, expiresAt: { lt: new Date(Date.now() - expiryGraceMs) } },
      select: { id: true },
      take: 50,
    });
    for (const payment of due) {
      await this.expireUnpaid(payment.id).catch((error) => this.logger.warn(`Expiry failed for ${payment.id}: ${(error as Error).message}`));
    }
  }

  /** Makes the checkout unpayable at the provider first, so a payment can never land after the dates are released. */
  async expireUnpaid(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== PaymentStatus.PENDING) return;
    if (payment.providerSessionId) {
      const state = await this.provider.expireCheckout(payment.providerSessionId);
      if (state.status === 'paid') {
        await this.markPaid(payment.providerSessionId, state.providerPaymentId, state.amount);
        return;
      }
    }
    await this.releaseUnpaid(payment.id, PaymentStatus.CANCELED);
  }

  private async releaseUnpaid(paymentId: string, status: PaymentStatus) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const updated = await tx.payment.updateMany({ where: { id: paymentId, status: PaymentStatus.PENDING }, data: { status } });
      if (!updated.count) return;
      const expired = await tx.booking.updateMany({ where: { id: payment.bookingId, status: BookingStatus.PENDING_PAYMENT }, data: { status: BookingStatus.EXPIRED } });
      if (expired.count) await tx.calendarHold.deleteMany({ where: { bookingId: payment.bookingId } });
    });
  }

  /** Confirms a paid booking. Safe to call any number of times, from anywhere. */
  async markPaid(sessionId: string, providerPaymentId: string | null, amount: number) {
    const payment = await this.prisma.payment.findUnique({ where: { providerSessionId: sessionId } });
    if (!payment) {
      this.logger.warn(`Payment for unknown checkout ${sessionId}`);
      return;
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.CANCELED] } },
        data: { status: PaymentStatus.SUCCEEDED, paidAt: new Date(), providerPaymentId, amount: amount || payment.amount },
      });
      if (!updated.count) return 'noop' as const;
      const confirmed = await tx.booking.updateMany({
        where: { id: payment.bookingId, status: BookingStatus.PENDING_PAYMENT },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      });
      if (!confirmed.count) return 'orphaned' as const;
      await this.notifications.bookingConfirmed(tx, payment.bookingId, amount || payment.amount);
      return 'confirmed' as const;
    });
    if (outcome === 'confirmed') this.notifications.flush();
    if (outcome === 'orphaned') await this.recoverOrphanedPayment(payment.id);
  }

  /**
   * Money arrived for a booking whose hold had already been released (only possible if a provider
   * ignores checkout expiry). Re-take the dates if still free; otherwise refund in full.
   */
  private async recoverOrphanedPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { booking: true } });
    const { booking } = payment;
    if (booking.status !== BookingStatus.EXPIRED) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockListingCalendar(tx, booking.listingId);
        await tx.calendarHold.create({ data: { listingId: booking.listingId, kind: HoldKind.BOOKING, startDate: booking.checkIn, endDate: booking.checkOut, bookingId: booking.id } });
        const confirmed = await tx.booking.updateMany({ where: { id: booking.id, status: BookingStatus.EXPIRED }, data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() } });
        if (!confirmed.count) throw new Error('Booking changed state during recovery.');
        await this.notifications.bookingConfirmed(tx, booking.id, payment.amount);
      });
      this.notifications.flush();
    } catch (error) {
      if (!isHoldOverlapError(error)) throw error;
      this.logger.warn(`Dates for late payment ${payment.id} were taken; refunding in full.`);
      await this.prisma.booking.update({ where: { id: booking.id }, data: { cancellationReason: 'Payment completed after the reservation expired and the dates were no longer available.', cancelledBy: 'System', cancelledAt: new Date() } });
      await this.refund(booking.id, payment.amount, 'System', 'Dates no longer available');
      await this.notifications.bookingCancelled(this.prisma, booking.id, { refundAmount: payment.amount, cancelledBy: 'host', reason: 'Your payment completed after the reservation window closed and the dates had been taken. You have been refunded in full.' });
      this.notifications.flush();
    }
  }

  // -------------------------------------------------------------------------
  // Refunds
  // -------------------------------------------------------------------------

  /** Refundable balance for a booking (paid minus refunds that are pending or done). */
  async refundable(bookingId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { bookingId, status: PaymentStatus.SUCCEEDED }, orderBy: { paidAt: 'desc' } });
    return { payment, available: payment ? payment.amount - payment.amountRefunded : 0 };
  }

  async refund(bookingId: string, amount: number, initiatedBy: string, reason = ''): Promise<Refund | null> {
    if (amount <= 0) return null;
    const { payment, available } = await this.refundable(bookingId);
    if (!payment?.providerPaymentId) throw new BadRequestException('There is no online payment to refund for this booking.');
    if (payment.provider !== this.provider.name) {
      throw new BadRequestException(`This payment was taken with "${payment.provider}", but the active payment provider is "${this.provider.name}". Refund it in that provider's dashboard.`);
    }
    if (amount > available) throw new BadRequestException(`At most ${(available / 100).toFixed(2)} ${payment.currency} can be refunded.`);

    // Reserve the amount atomically so concurrent refunds can never exceed what was paid.
    const reserved = await this.prisma.$executeRaw`
      UPDATE "Payment" SET "amountRefunded" = "amountRefunded" + ${amount}, "updatedAt" = now()
      WHERE "id" = ${payment.id}::uuid AND "status" = 'SUCCEEDED'::"PaymentStatus" AND "amountRefunded" + ${amount} <= "amount"`;
    if (!reserved) throw new BadRequestException('That refund exceeds the remaining paid balance.');

    const refund = await this.prisma.refund.create({ data: { paymentId: payment.id, amount, initiatedBy, reason } });
    return this.submitRefund(refund.id, refund.id);
  }

  async retryRefund(refundId: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('Refund not found.');
    if (refund.status !== RefundStatus.FAILED) throw new BadRequestException('Only failed refunds can be retried.');
    const reserved = await this.prisma.$executeRaw`
      UPDATE "Payment" SET "amountRefunded" = "amountRefunded" + ${refund.amount}, "updatedAt" = now()
      WHERE "id" = ${refund.paymentId}::uuid AND "amountRefunded" + ${refund.amount} <= "amount"`;
    if (!reserved) throw new BadRequestException('That refund exceeds the remaining paid balance.');
    await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.PENDING, failureMessage: null } });
    return this.submitRefund(refund.id, `${refund.id}-retry-${Date.now()}`);
  }

  private async submitRefund(refundId: string, reference: string) {
    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
    try {
      const result = await this.provider.refund({ reference, providerPaymentId: refund.payment.providerPaymentId!, amount: refund.amount, reason: refund.reason });
      await this.prisma.refund.update({ where: { id: refund.id }, data: { providerRefundId: result.providerRefundId } });
      await this.applyRefundState(refund.id, result.status, result.failureMessage);
    } catch (error) {
      this.logger.error(`Refund ${refund.id} failed: ${(error as Error).message}`);
      await this.applyRefundState(refund.id, 'failed', (error as Error).message);
    }
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  /** Moves a refund to a new state; a refund that fails gives its reserved amount back to the payment (once). */
  private async applyRefundState(refundId: string, state: 'pending' | 'succeeded' | 'failed', failureMessage?: string) {
    // Only terminal transitions matter, and they only move forward: PENDING → SUCCEEDED, anything → FAILED.
    if (state === 'pending') return;
    const status = state === 'succeeded' ? RefundStatus.SUCCEEDED : RefundStatus.FAILED;
    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      const changed = await tx.refund.updateMany({
        where: { id: refundId, status: status === RefundStatus.SUCCEEDED ? RefundStatus.PENDING : { not: RefundStatus.FAILED } },
        data: { status, failureMessage: failureMessage?.slice(0, 500) ?? null },
      });
      if (changed.count && status === RefundStatus.FAILED) {
        await tx.$executeRaw`UPDATE "Payment" SET "amountRefunded" = GREATEST(0, "amountRefunded" - ${refund.amount}), "updatedAt" = now() WHERE "id" = ${refund.paymentId}::uuid`;
      }
    });
  }

  // -------------------------------------------------------------------------
  // Webhooks / provider events
  // -------------------------------------------------------------------------

  async handleEvent(event: PaymentEvent) {
    const seen = await this.prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: this.provider.name, eventId: event.eventId } } });
    if (seen) return;
    switch (event.kind) {
      case 'checkout.paid':
        await this.markPaid(event.sessionId, event.providerPaymentId, event.amount);
        break;
      case 'checkout.expired': {
        const payment = await this.prisma.payment.findUnique({ where: { providerSessionId: event.sessionId } });
        if (payment) await this.releaseUnpaid(payment.id, PaymentStatus.CANCELED);
        break;
      }
      case 'refund.updated': {
        const refund = await this.prisma.refund.findUnique({ where: { providerRefundId: event.providerRefundId } });
        if (refund) await this.applyRefundState(refund.id, event.status, event.failureMessage);
        break;
      }
      case 'ignored':
        break;
    }
    // Recorded only after successful processing, so a failure is retried by the provider's redelivery.
    await this.prisma.webhookEvent
      .create({ data: { provider: this.provider.name, eventId: event.eventId, type: event.kind } })
      .catch(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  async summary(bookingId: string) {
    const payments = await this.prisma.payment.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' }, include: { refunds: { orderBy: { createdAt: 'asc' } } } });
    const succeeded = payments.filter((payment) => payment.status === PaymentStatus.SUCCEEDED);
    const refunds = payments.flatMap((payment) => payment.refunds);
    return {
      provider: this.provider.name,
      amountPaid: succeeded.reduce((sum, payment) => sum + payment.amount, 0),
      amountRefunded: refunds.filter((refund) => refund.status === RefundStatus.SUCCEEDED).reduce((sum, refund) => sum + refund.amount, 0),
      refundPending: refunds.filter((refund) => refund.status === RefundStatus.PENDING).reduce((sum, refund) => sum + refund.amount, 0),
      payments: payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        amountRefunded: payment.amountRefunded,
        providerPaymentId: payment.providerPaymentId,
        paidAt: payment.paidAt,
        expiresAt: payment.expiresAt,
        createdAt: payment.createdAt,
      })),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        initiatedBy: refund.initiatedBy,
        failureMessage: refund.failureMessage,
        createdAt: refund.createdAt,
      })),
    };
  }
}
