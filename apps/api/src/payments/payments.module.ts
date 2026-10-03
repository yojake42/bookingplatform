import { BadRequestException, Controller, Get, Global, HttpCode, Logger, Module, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { FakePaymentProvider } from './fake.provider';
import { InvalidWebhookError, PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentsService } from './payments.service';
import { StripePaymentProvider } from './stripe.provider';

@Controller('payments')
class PaymentWebhooksController {
  private readonly logger = new Logger('PaymentWebhooks');

  constructor(private readonly payments: PaymentsService) {}

  /** e.g. POST /api/payments/webhooks/stripe — no session or CSRF; authenticity comes from the provider signature. */
  @Post('webhooks/:provider')
  @HttpCode(200)
  async webhook(@Param('provider') providerName: string, @Req() request: RawBodyRequest<Request>) {
    if (providerName !== this.payments.provider.name) throw new NotFoundException();
    if (!request.rawBody) throw new BadRequestException('Missing body.');
    let event;
    try {
      event = this.payments.provider.parseWebhook(request.rawBody, request.headers);
    } catch (error) {
      if (error instanceof InvalidWebhookError) {
        this.logger.warn(`Rejected webhook: ${error.message}`);
        throw new BadRequestException('Invalid signature.');
      }
      throw error;
    }
    await this.payments.handleEvent(event);
    return { received: true };
  }
}

/** Test checkout used by the fake provider in local development. Returns 404 for any real provider. */
@Controller('dev/payments')
class DevPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  private fake() {
    if (!(this.payments.provider instanceof FakePaymentProvider)) throw new NotFoundException();
    return this.payments.provider;
  }

  @Get(':sessionId')
  async session(@Param('sessionId') sessionId: string) {
    this.fake();
    const payment = await this.prisma.payment.findUnique({
      where: { providerSessionId: sessionId },
      include: { booking: { include: { listing: { select: { title: true, city: true } } } } },
    });
    if (!payment) throw new NotFoundException('Checkout not found.');
    const { booking } = payment;
    return {
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      expiresAt: payment.expiresAt,
      listingTitle: booking.listing.title,
      city: booking.listing.city,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      nights: booking.nights,
      guests: booking.guests,
      guestEmail: booking.guestEmail,
      nightlyPrice: booking.nightlyPrice,
      cleaningFee: booking.cleaningFee,
    };
  }

  @Post(':sessionId/pay')
  @HttpCode(200)
  async pay(@Param('sessionId') sessionId: string) {
    const provider = this.fake();
    const payment = await this.prisma.payment.findUnique({ where: { providerSessionId: sessionId } });
    if (!payment) throw new NotFoundException('Checkout not found.');
    if (payment.status !== 'PENDING') throw new BadRequestException(`This checkout is ${payment.status.toLowerCase()}.`);
    if (payment.expiresAt.getTime() < Date.now()) throw new BadRequestException('This checkout has expired.');
    await this.payments.handleEvent(provider.paidEvent(sessionId, payment.amount));
    return { ok: true };
  }
}

/** Chooses the provider from PAYMENT_PROVIDER. Add new providers here. */
function paymentProviderFactory(config: ConfigService): PaymentProvider {
  const name = config.get<string>('PAYMENT_PROVIDER', 'fake').toLowerCase();
  const webUrl = (config.get<string>('PUBLIC_WEB_URL') || config.get<string>('WEB_ORIGIN', 'http://localhost:5180')).replace(/\/+$/, '');
  switch (name) {
    case 'stripe':
      return new StripePaymentProvider(config.getOrThrow<string>('STRIPE_SECRET_KEY'), config.get<string>('STRIPE_WEBHOOK_SECRET', ''));
    case 'fake':
      if (config.get<string>('NODE_ENV') === 'production' && config.get<string>('ALLOW_FAKE_PAYMENTS') !== 'true') {
        throw new Error('PAYMENT_PROVIDER=fake is not allowed in production (it confirms bookings without taking payment). Set ALLOW_FAKE_PAYMENTS=true only for test environments.');
      }
      return new FakePaymentProvider(webUrl);
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Use "stripe" or "fake".`);
  }
}

@Global()
@Module({
  controllers: [PaymentWebhooksController, DevPaymentsController],
  providers: [{ provide: PAYMENT_PROVIDER, useFactory: paymentProviderFactory, inject: [ConfigService] }, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
