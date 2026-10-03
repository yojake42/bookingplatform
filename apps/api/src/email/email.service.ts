import { Inject, Injectable, Logger, NotFoundException, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailStatus, Prisma, type EmailMessage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER, PermanentEmailError, type EmailAddress, type EmailProvider } from './email-provider';

export type EmailDraft = {
  template: string;
  to: EmailAddress;
  subject: string;
  html: string;
  text: string;
  bookingId?: string;
};

type Db = PrismaService | Prisma.TransactionClient;

/** Retry schedule after a failed attempt (attempt 1 → 1 minute, …). After the last, the email is marked FAILED. */
const backoffMinutes = [1, 5, 15, 60, 240];
const batchSize = 10;

@Injectable()
export class EmailService implements OnApplicationShutdown {
  private readonly logger = new Logger(EmailService.name);
  private draining = false;
  private drainAgain = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  get from(): EmailAddress {
    return {
      email: this.config.get<string>('EMAIL_FROM_ADDRESS', 'stays@example.com'),
      name: this.config.get<string>('EMAIL_FROM_NAME', 'Haven'),
    };
  }

  /**
   * Adds an email to the outbox. Pass the transaction client to make the email part of the same
   * commit as the change that caused it (e.g. a booking confirmation). Call `flush()` after commit.
   */
  async enqueue(db: Db, draft: EmailDraft) {
    return db.emailMessage.create({
      data: {
        template: draft.template,
        toEmail: draft.to.email.toLowerCase(),
        toName: draft.to.name ?? '',
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        bookingId: draft.bookingId,
      },
      select: { id: true },
    });
  }

  /** Starts delivering pending email on this replica without blocking the caller. */
  flush() {
    if (this.stopped) return;
    if (this.draining) {
      this.drainAgain = true;
      return;
    }
    setImmediate(() => void this.drain());
  }

  /** Safety net for retries and for emails enqueued by replicas that went away before sending. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  sweep() {
    this.flush();
  }

  onApplicationShutdown() {
    this.stopped = true;
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      do {
        this.drainAgain = false;
        let batch: EmailMessage[];
        do {
          batch = await this.claimBatch();
          for (const message of batch) await this.deliver(message);
        } while (batch.length === batchSize && !this.stopped);
      } while (this.drainAgain && !this.stopped);
    } catch (error) {
      this.logger.error(`Email outbox drain failed: ${(error as Error).message}`);
    } finally {
      this.draining = false;
    }
  }

  /**
   * Claims due messages. SKIP LOCKED lets every replica drain concurrently without two replicas ever
   * taking the same row; `lockedUntil` returns rows to the pool if a replica dies mid-send.
   */
  private claimBatch() {
    return this.prisma.$queryRaw<EmailMessage[]>`
      UPDATE "EmailMessage"
      SET "status" = 'SENDING'::"EmailStatus", "lockedUntil" = now() + interval '2 minutes', "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "EmailMessage"
        WHERE ("status" = 'PENDING'::"EmailStatus" AND "nextAttemptAt" <= now())
           OR ("status" = 'SENDING'::"EmailStatus" AND "lockedUntil" < now())
        ORDER BY "createdAt"
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
  }

  private async deliver(message: EmailMessage) {
    try {
      const replyTo = this.config.get<string>('EMAIL_REPLY_TO');
      const result = await this.provider.send({
        to: { email: message.toEmail, name: message.toName || undefined },
        from: this.from,
        replyTo: replyTo ? { email: replyTo } : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [message.template],
      });
      await this.prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: EmailStatus.SENT, sentAt: new Date(), lockedUntil: null, lastError: null, provider: this.provider.name, providerMessageId: result.messageId },
      });
    } catch (error) {
      const permanent = error instanceof PermanentEmailError;
      const delay = backoffMinutes[message.attempts - 1];
      const giveUp = permanent || delay === undefined;
      this.logger.warn(`Email ${message.id} (${message.template}) attempt ${message.attempts} failed: ${(error as Error).message}`);
      await this.prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          status: giveUp ? EmailStatus.FAILED : EmailStatus.PENDING,
          nextAttemptAt: new Date(Date.now() + (delay ?? 0) * 60_000),
          lockedUntil: null,
          lastError: (error as Error).message.slice(0, 1000),
          provider: this.provider.name,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Staff console
  // -------------------------------------------------------------------------

  async list(query: { status?: EmailStatus; q?: string; page?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const q = query.q?.trim();
    const where: Prisma.EmailMessageWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [{ toEmail: { contains: q, mode: 'insensitive' } }, { subject: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        select: { id: true, template: true, toEmail: true, toName: true, subject: true, status: true, attempts: true, lastError: true, provider: true, sentAt: true, createdAt: true, bookingId: true },
      }),
      this.prisma.emailMessage.count({ where }),
    ]);
    return { items, total, page, pageSize: 50, provider: this.provider.name };
  }

  async get(id: string) {
    const message = await this.prisma.emailMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('Email not found.');
    return message;
  }

  async retry(id: string) {
    const updated = await this.prisma.emailMessage.updateMany({
      where: { id, status: { in: [EmailStatus.FAILED, EmailStatus.SENT] } },
      data: { status: EmailStatus.PENDING, nextAttemptAt: new Date(), attempts: 0, lastError: null },
    });
    if (!updated.count) throw new NotFoundException('Only sent or failed emails can be re-sent.');
    this.flush();
    return this.get(id);
  }
}
