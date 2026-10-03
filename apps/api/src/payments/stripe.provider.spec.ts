import Stripe from 'stripe';
import { InvalidWebhookError } from './payment-provider';
import { StripePaymentProvider } from './stripe.provider';

const secret = 'whsec_test_secret';
const realStripe = new Stripe('sk_test_dummy');

function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = realStripe.webhooks.generateTestHeaderString({ payload, secret });
  return { body: Buffer.from(payload), headers: { 'stripe-signature': header } };
}

const sessionEvent = (type: string, session: object) => ({ id: `evt_${type}`, object: 'event', type, data: { object: { object: 'checkout.session', ...session } } });

describe('StripePaymentProvider webhooks', () => {
  const provider = new StripePaymentProvider('sk_test_dummy', secret);

  it('verifies signatures and normalizes a paid checkout', () => {
    const { body, headers } = signed(sessionEvent('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 123_45 }));
    expect(provider.parseWebhook(body, headers)).toEqual({ kind: 'checkout.paid', eventId: 'evt_checkout.session.completed', sessionId: 'cs_1', providerPaymentId: 'pi_1', amount: 123_45 });
  });

  it('waits for async payment methods instead of confirming an unpaid completion', () => {
    const { body, headers } = signed(sessionEvent('checkout.session.completed', { id: 'cs_2', payment_status: 'unpaid' }));
    expect(provider.parseWebhook(body, headers).kind).toBe('ignored');
  });

  it('maps expirations and refund updates', () => {
    const expired = signed(sessionEvent('checkout.session.expired', { id: 'cs_3' }));
    expect(provider.parseWebhook(expired.body, expired.headers)).toMatchObject({ kind: 'checkout.expired', sessionId: 'cs_3' });
    const refund = signed({ id: 'evt_r', object: 'event', type: 'refund.updated', data: { object: { object: 'refund', id: 're_1', status: 'failed', failure_reason: 'expired_or_canceled_card' } } });
    expect(provider.parseWebhook(refund.body, refund.headers)).toEqual({ kind: 'refund.updated', eventId: 'evt_r', providerRefundId: 're_1', status: 'failed', failureMessage: 'expired_or_canceled_card' });
  });

  it('rejects tampered or unsigned payloads', () => {
    const { headers } = signed(sessionEvent('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', amount_total: 1 }));
    const tampered = Buffer.from(JSON.stringify(sessionEvent('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', amount_total: 999_999 })));
    expect(() => provider.parseWebhook(tampered, headers)).toThrow(InvalidWebhookError);
    expect(() => provider.parseWebhook(tampered, {})).toThrow(InvalidWebhookError);
  });
});

describe('StripePaymentProvider API calls', () => {
  function fakeClient() {
    const calls: Record<string, unknown[]> = {};
    const record = (name: string, result: unknown) => (...args: unknown[]) => {
      calls[name] = args;
      return Promise.resolve(typeof result === 'function' ? (result as () => unknown)() : result);
    };
    let status = 'open';
    const client = {
      checkout: {
        sessions: {
          create: record('create', { id: 'cs_new', url: 'https://checkout.stripe.com/c/pay/cs_new' }),
          retrieve: record('retrieve', () => ({ id: 'cs_new', status, payment_status: status === 'complete' ? 'paid' : 'unpaid', payment_intent: 'pi_9', amount_total: 500 })),
          expire: record('expire', { id: 'cs_new', status: 'expired', payment_status: 'unpaid' }),
        },
      },
      refunds: { create: record('refund', { id: 're_9', status: 'succeeded', failure_reason: null }) },
      webhooks: realStripe.webhooks,
    };
    return { client: client as unknown as Stripe, calls, setStatus: (value: string) => (status = value) };
  }

  it('creates an itemized, idempotent checkout that expires with the date hold', async () => {
    const { client, calls } = fakeClient();
    const provider = new StripePaymentProvider('sk_test_dummy', secret, client);
    const expiresAt = new Date(Date.now() + 45 * 60_000);
    const session = await provider.createCheckout({
      reference: 'pay_1',
      amount: 70_000,
      currency: 'USD',
      customerEmail: 'guest@example.com',
      description: 'Cabin · ABC',
      lineItems: [
        { name: 'Cabin', unitAmount: 20_000, quantity: 3, imageUrl: 'http://localhost/img.webp' },
        { name: 'Cleaning fee', unitAmount: 10_000, quantity: 1 },
      ],
      successUrl: 'https://site/trips/t?payment=success',
      cancelUrl: 'https://site/trips/t?payment=cancelled',
      expiresAt,
      metadata: { bookingId: 'b1' },
    });
    expect(session).toEqual({ sessionId: 'cs_new', url: 'https://checkout.stripe.com/c/pay/cs_new' });
    const [params, options] = calls.create as [Stripe.Checkout.SessionCreateParams, { idempotencyKey: string }];
    expect(options.idempotencyKey).toBe('checkout-pay_1');
    expect(params.expires_at).toBe(Math.floor(expiresAt.getTime() / 1000));
    expect(params.line_items).toHaveLength(2);
    expect(params.line_items![0].price_data).toMatchObject({ currency: 'usd', unit_amount: 20_000 });
    // Non-https images are dropped (Stripe would reject them).
    expect(params.line_items![0].price_data!.product_data).not.toHaveProperty('images');
  });

  it('reports "paid" instead of expiring when the guest finished paying first', async () => {
    const { client, setStatus, calls } = fakeClient();
    const provider = new StripePaymentProvider('sk_test_dummy', secret, client);
    setStatus('complete');
    expect(await provider.expireCheckout('cs_new')).toEqual({ status: 'paid', providerPaymentId: 'pi_9', amount: 500 });
    expect(calls.expire).toBeUndefined();
    setStatus('open');
    expect(await provider.expireCheckout('cs_new')).toEqual({ status: 'expired' });
  });

  it('refunds against the payment intent with an idempotency key', async () => {
    const { client, calls } = fakeClient();
    const provider = new StripePaymentProvider('sk_test_dummy', secret, client);
    expect(await provider.refund({ reference: 'ref_1', providerPaymentId: 'pi_9', amount: 250 })).toEqual({ providerRefundId: 're_9', status: 'succeeded', failureMessage: undefined });
    const [params, options] = calls.refund as [Stripe.RefundCreateParams, { idempotencyKey: string }];
    expect(params).toMatchObject({ payment_intent: 'pi_9', amount: 250 });
    expect(options.idempotencyKey).toBe('refund-ref_1');
  });
});
