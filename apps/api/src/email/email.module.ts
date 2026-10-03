import { Controller, Get, Global, Logger, Module, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailStatus } from '@prisma/client';
import { SessionGuard } from '../auth/session.guard';
import { EMAIL_PROVIDER, type EmailProvider } from './email-provider';
import { EmailService } from './email.service';
import { NotificationsService } from './notifications.service';
import { BrevoEmailProvider, LogEmailProvider } from './providers';

@Controller('admin/emails')
@UseGuards(SessionGuard)
class AdminEmailsController {
  constructor(private readonly email: EmailService) {}

  @Get()
  list(@Query('status') status?: string, @Query('q') q?: string, @Query('page') page?: string) {
    const valid = Object.values(EmailStatus).includes(status as EmailStatus) ? (status as EmailStatus) : undefined;
    return this.email.list({ status: valid, q: q?.slice(0, 120), page: Number(page) || 1 });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.email.get(id);
  }

  @Post(':id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.email.retry(id);
  }
}

/** Chooses the provider from EMAIL_PROVIDER. Add new providers here. */
function emailProviderFactory(config: ConfigService): EmailProvider {
  const name = config.get<string>('EMAIL_PROVIDER', 'log').toLowerCase();
  switch (name) {
    case 'brevo':
      return new BrevoEmailProvider(config.getOrThrow<string>('BREVO_API_KEY'), config.get<string>('BREVO_API_URL') || undefined);
    case 'log':
      if (config.get<string>('NODE_ENV') === 'production') new Logger('Email').warn('EMAIL_PROVIDER=log in production: emails are recorded but not delivered.');
      return new LogEmailProvider();
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${name}". Use "brevo" or "log".`);
  }
}

@Global()
@Module({
  controllers: [AdminEmailsController],
  providers: [
    { provide: EMAIL_PROVIDER, useFactory: emailProviderFactory, inject: [ConfigService] },
    EmailService,
    NotificationsService,
  ],
  exports: [EmailService, NotificationsService],
})
export class EmailModule {}
