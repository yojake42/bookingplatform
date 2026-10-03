import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { PermanentEmailError } from './email-provider';
import { BrevoEmailProvider } from './providers';
import { bookingConfirmedEmail, escapeHtml } from './templates';

describe('BrevoEmailProvider', () => {
  let server: Server;
  let url: string;
  let last: { headers: IncomingMessage['headers']; body: Record<string, unknown> } | null = null;
  let reply: { status: number; body: object } = { status: 201, body: { messageId: '<abc@smtp-relay.brevo.com>' } };

  beforeAll(async () => {
    server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        last = { headers: request.headers, body: JSON.parse(raw) };
        response.writeHead(reply.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v3/smtp/email`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const message = {
    to: { email: 'guest@example.com', name: 'Guest' },
    from: { email: 'stays@example.com', name: 'Haven' },
    replyTo: { email: 'help@example.com' },
    subject: 'Hello',
    html: '<p>Hi</p>',
    text: 'Hi',
    tags: ['booking_confirmed'],
  };

  it('sends the transactional email payload with the API key', async () => {
    reply = { status: 201, body: { messageId: '<abc@smtp-relay.brevo.com>' } };
    const result = await new BrevoEmailProvider('xkeysib-test', url).send(message);
    expect(result.messageId).toBe('<abc@smtp-relay.brevo.com>');
    expect(last!.headers['api-key']).toBe('xkeysib-test');
    expect(last!.body).toEqual({
      sender: { email: 'stays@example.com', name: 'Haven' },
      to: [{ email: 'guest@example.com', name: 'Guest' }],
      replyTo: { email: 'help@example.com' },
      subject: 'Hello',
      htmlContent: '<p>Hi</p>',
      textContent: 'Hi',
      tags: ['booking_confirmed'],
    });
  });

  it('treats 400s as permanent and 5xx/429 as retryable', async () => {
    reply = { status: 400, body: { code: 'invalid_parameter', message: 'email is not valid' } };
    await expect(new BrevoEmailProvider('k', url).send(message)).rejects.toBeInstanceOf(PermanentEmailError);
    reply = { status: 503, body: { message: 'unavailable' } };
    const error = await new BrevoEmailProvider('k', url).send(message).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentEmailError);
  });
});

describe('email templates', () => {
  it('escapes user-supplied content', () => {
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
    const rendered = bookingConfirmedEmail({
      code: 'ABCD1234',
      guestName: '<b>Mallory</b> Smith',
      guests: 2,
      nights: 3,
      checkIn: new Date('2026-11-10T00:00:00Z'),
      checkOut: new Date('2026-11-13T00:00:00Z'),
      totalPrice: 60000,
      currency: 'USD',
      tripUrl: 'https://haven.example/trips/token',
      amountPaid: 60000,
      cancellationPolicy: 'Flexible',
      listing: { title: 'Cabin', city: 'Truckee', region: 'CA', timeZone: 'America/Los_Angeles', checkInTime: '15:00', checkOutTime: '11:00', address: '1 Pine Rd' },
    });
    expect(rendered.html).not.toContain('<b>Mallory</b>');
    expect(rendered.html).toContain('3:00 PM PST');
    expect(rendered.text).toContain('https://haven.example/trips/token');
  });
});
