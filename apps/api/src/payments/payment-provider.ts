/**
 * Swappable payment processing. Bookings and refunds only talk to this interface; Stripe is one
 * implementation. A provider must offer a hosted checkout page, a way to query/expire it, refunds,
 * and signed webhooks normalized into PaymentEvents.
 */

export type CheckoutLineItem = { name: string; description?: string; unitAmount: number; quantity: number; imageUrl?: string };

export type CheckoutRequest = {
  /** Our payment id; used as the provider idempotency key so retries never create two checkouts. */
  reference: string;
  amount: number;
  currency: string;
  lineItems: CheckoutLineItem[];
  customerEmail: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  metadata: Record<string, string>;
};

export type CheckoutSession = { sessionId: string; url: string };

export type CheckoutState =
  | { status: 'open' }
  | { status: 'expired' }
  | { status: 'paid'; providerPaymentId: string | null; amount: number };

export type RefundRequest = {
  /** Our refund id (+ attempt); idempotency key. */
  reference: string;
  providerPaymentId: string;
  amount: number;
  reason?: string;
};

export type RefundState = 'pending' | 'succeeded' | 'failed';
export type RefundResult = { providerRefundId: string; status: RefundState; failureMessage?: string };

export type PaymentEvent =
  | { kind: 'checkout.paid'; eventId: string; sessionId: string; providerPaymentId: string | null; amount: number }
  | { kind: 'checkout.expired'; eventId: string; sessionId: string }
  | { kind: 'refund.updated'; eventId: string; providerRefundId: string; status: RefundState; failureMessage?: string }
  | { kind: 'ignored'; eventId: string; type: string };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  getCheckout(sessionId: string): Promise<CheckoutState>;
  /** Makes an open checkout unpayable. Returns the final state, which is `paid` if the guest got there first. */
  expireCheckout(sessionId: string): Promise<CheckoutState>;
  refund(request: RefundRequest): Promise<RefundResult>;
  /** Verifies the webhook signature and normalizes the event. Throws InvalidWebhookError on a bad signature. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export class InvalidWebhookError extends Error {}
