import Stripe from 'stripe';
import {
  InvalidWebhookError,
  type CheckoutRequest,
  type CheckoutState,
  type PaymentEvent,
  type PaymentProvider,
  type RefundRequest,
  type RefundResult,
  type RefundState,
} from './payment-provider';

/** Stripe Checkout (hosted payment page) + Refunds + signed webhooks. */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    client?: Stripe,
  ) {
    this.stripe = client ?? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  }

  async createCheckout(request: CheckoutRequest) {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Immediate methods only: a booking must be paid before its date hold expires.
        allowed_payment_method_types: ['card', 'link'],
        submit_type: 'book',
        customer_email: request.customerEmail,
        client_reference_id: request.reference,
        line_items: request.lineItems.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: item.unitAmount,
            product_data: {
              name: item.name,
              ...(item.description ? { description: item.description } : {}),
              // Stripe only accepts publicly reachable https images.
              ...(item.imageUrl?.startsWith('https://') ? { images: [item.imageUrl] } : {}),
            },
          },
        })),
        payment_intent_data: { description: request.description, metadata: request.metadata },
        metadata: request.metadata,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        // Stripe requires 30 minutes to 24 hours.
        expires_at: Math.floor(Math.max(request.expiresAt.getTime(), Date.now() + 30 * 60_000 + 5_000) / 1000),
      },
      { idempotencyKey: `checkout-${request.reference}` },
    );
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return { sessionId: session.id, url: session.url };
  }

  async getCheckout(sessionId: string): Promise<CheckoutState> {
    return this.toState(await this.stripe.checkout.sessions.retrieve(sessionId));
  }

  async expireCheckout(sessionId: string): Promise<CheckoutState> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== 'open') return this.toState(session);
    try {
      return this.toState(await this.stripe.checkout.sessions.expire(sessionId));
    } catch (error) {
      // Lost a race with the guest completing payment: report what actually happened.
      return this.toState(await this.stripe.checkout.sessions.retrieve(sessionId).catch(() => { throw error; }));
    }
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: request.providerPaymentId,
        amount: request.amount,
        reason: 'requested_by_customer',
        metadata: { reference: request.reference, ...(request.reason ? { note: request.reason.slice(0, 450) } : {}) },
      },
      { idempotencyKey: `refund-${request.reference}` },
    );
    return { providerRefundId: refund.id, status: mapRefundStatus(refund.status), failureMessage: refund.failure_reason ?? undefined };
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent {
    const signature = headers['stripe-signature'];
    if (!signature || !this.webhookSecret) throw new InvalidWebhookError('Missing Stripe signature or webhook secret.');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, Array.isArray(signature) ? signature[0] : signature, this.webhookSecret);
    } catch (error) {
      throw new InvalidWebhookError((error as Error).message);
    }
    return normalizeStripeEvent(event);
  }

  private toState(session: Stripe.Checkout.Session): CheckoutState {
    if (session.status === 'complete' && session.payment_status === 'paid') {
      return { status: 'paid', providerPaymentId: idOf(session.payment_intent), amount: session.amount_total ?? 0 };
    }
    if (session.status === 'expired') return { status: 'expired' };
    return { status: 'open' };
  }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function mapRefundStatus(status: string | null): RefundState {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'pending';
}

/** Exported for tests: maps Stripe events onto the provider-neutral PaymentEvent. */
export function normalizeStripeEvent(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== 'paid') return { kind: 'ignored', eventId: event.id, type: event.type };
      return { kind: 'checkout.paid', eventId: event.id, sessionId: session.id, providerPaymentId: idOf(session.payment_intent), amount: session.amount_total ?? 0 };
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      return { kind: 'checkout.expired', eventId: event.id, sessionId: session.id };
    }
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed': {
      const refund = event.data.object as Stripe.Refund;
      return { kind: 'refund.updated', eventId: event.id, providerRefundId: refund.id, status: mapRefundStatus(refund.status), failureMessage: refund.failure_reason ?? undefined };
    }
    default:
      return { kind: 'ignored', eventId: event.id, type: event.type };
  }
}
