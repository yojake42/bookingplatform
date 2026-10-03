import { Logger } from '@nestjs/common';
import { PermanentEmailError, type EmailProvider, type OutgoingEmail } from './email-provider';

/** Brevo transactional email API (https://developers.brevo.com/reference/sendtransacemail). */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';

  constructor(
    private readonly apiKey: string,
    private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email',
  ) {}

  async send(message: OutgoingEmail) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: message.from.email, name: message.from.name },
        to: [{ email: message.to.email, ...(message.to.name ? { name: message.to.name } : {}) }],
        ...(message.replyTo ? { replyTo: { email: message.replyTo.email, name: message.replyTo.name } } : {}),
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.tags?.length ? { tags: message.tags } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (!response.ok) {
      const detail = `Brevo ${response.status}: ${body.message ?? body.code ?? response.statusText}`;
      // 400s describe the message itself (bad address, invalid payload): retrying won't help.
      if (response.status === 400) throw new PermanentEmailError(detail);
      throw new Error(detail);
    }
    return { messageId: body.messageId ?? null };
  }
}

/**
 * Development provider: "delivers" by logging. Every message is still stored in the outbox, so the
 * staff console's Emails page doubles as a local inbox with full HTML previews.
 */
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  private readonly logger = new Logger('Email');

  async send(message: OutgoingEmail) {
    this.logger.log(`[log provider] to=${message.to.email} subject="${message.subject}"`);
    return { messageId: null };
  }
}
