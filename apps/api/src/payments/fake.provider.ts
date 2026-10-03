import { randomUUID } from 'crypto';
import { InvalidWebhookError, type CheckoutRequest, type CheckoutState, type PaymentEvent, type PaymentProvider, type RefundRequest } from './payment-provider';

/**
 * Local-development provider: checkouts open an in-app test payment page (/dev/checkout/:id) and
 * "payments" are confirmed through the dev payments endpoint, which feeds the same event pipeline as
 * real webhooks. Never moves money; the app refuses to start with it in production unless explicitly allowed.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';

  constructor(private readonly webUrl: string) {}

  async createCheckout(request: CheckoutRequest) {
    const sessionId = `fake_cs_${request.reference.replace(/-/g, '')}`;
    const params = new URLSearchParams({ success: request.successUrl, cancel: request.cancelUrl });
    return { sessionId, url: `${this.webUrl}/dev/checkout/${sessionId}?${params}` };
  }

  /** The fake provider keeps no state; unpaid checkouts are simply "open" until our own expiry job ends them. */
  async getCheckout(): Promise<CheckoutState> {
    return { status: 'open' };
  }

  async expireCheckout(): Promise<CheckoutState> {
    return { status: 'expired' };
  }

  async refund(request: RefundRequest) {
    return { providerRefundId: `fake_re_${request.reference.replace(/[^a-zA-Z0-9]/g, '')}`, status: 'succeeded' as const };
  }

  parseWebhook(): PaymentEvent {
    throw new InvalidWebhookError('The fake provider does not receive webhooks.');
  }

  /** Event the dev "Pay" button produces, as if a real provider had sent a webhook. */
  paidEvent(sessionId: string, amount: number): PaymentEvent {
    return { kind: 'checkout.paid', eventId: `fake_evt_${randomUUID()}`, sessionId, providerPaymentId: `fake_pi_${randomUUID().replace(/-/g, '')}`, amount };
  }
}
