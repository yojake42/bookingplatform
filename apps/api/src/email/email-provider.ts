/**
 * Swappable email delivery. The rest of the app only ever talks to this interface (via the
 * outbox in EmailService); add a provider by implementing it and registering it in email.module.ts.
 */
export type EmailAddress = { email: string; name?: string };

export type OutgoingEmail = {
  to: EmailAddress;
  from: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  html: string;
  text: string;
  /** Provider-side tags for analytics/filtering, e.g. the template name. */
  tags?: string[];
};

export interface EmailProvider {
  readonly name: string;
  send(message: OutgoingEmail): Promise<{ messageId: string | null }>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/** Thrown for failures that retrying cannot fix (e.g. an invalid recipient), so the outbox gives up immediately. */
export class PermanentEmailError extends Error {}
