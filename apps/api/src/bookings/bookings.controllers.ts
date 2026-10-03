import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingSource } from '@prisma/client';
import { SessionGuard } from '../auth/session.guard';
import { RateLimitService } from '../common/rate-limit.service';
import { clientIp, CurrentUser, type AppRequest, type AuthenticatedUser } from '../common/request';
import { QuoteQuery } from '../listings/listing.dto';
import { AvailabilityService } from './availability.service';
import { BookingsService } from './bookings.service';
import {
  AdminBookingsQuery,
  CalendarQuery,
  CancelBookingDto,
  CreateBlockDto,
  CreateBookingDto,
  IssueRefundDto,
  StaffCancelDto,
  StaffCreateBookingDto,
  TripLinksDto,
  TripLookupDto,
} from './booking.dto';
import { NotificationsService } from '../email/notifications.service';
import { PaymentsService } from '../payments/payments.service';

const tokenPattern = /^[A-Za-z0-9_-]{20,64}$/;

function assertToken(token: string) {
  if (!tokenPattern.test(token)) throw new NotFoundException('Booking not found.');
  return token;
}

@Controller('public')
export class PublicBookingsController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly bookings: BookingsService,
    private readonly rateLimit: RateLimitService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('listings/:id/availability')
  listingAvailability(@Param('id', ParseUUIDPipe) id: string, @Query() query: CalendarQuery) {
    return this.availability.publicAvailability(id, query.from, query.to);
  }

  @Get('listings/:id/quote')
  quote(@Param('id', ParseUUIDPipe) id: string, @Query() query: QuoteQuery) {
    return this.availability.quote(id, query);
  }

  @Post('bookings')
  async create(@Body() dto: CreateBookingDto, @Req() request: AppRequest) {
    const perHour = Number(this.config.get<string>('BOOKING_RATE_LIMIT_PER_HOUR', '30'));
    await this.rateLimit.consume(`booking:ip:${clientIp(request)}`, perHour, 60 * 60);
    const { booking, checkoutUrl } = await this.bookings.create(dto, { source: BookingSource.WEBSITE });
    return { code: booking.code, token: booking.manageToken, status: booking.status, checkoutUrl };
  }

  @Post('trips/lookup')
  @HttpCode(200)
  async lookup(@Body() dto: TripLookupDto, @Req() request: AppRequest) {
    await this.rateLimit.consume(`trip-lookup:ip:${clientIp(request)}`, 15, 15 * 60, 'Too many lookups. Please wait a few minutes.');
    return this.bookings.lookupToken(dto.code, dto.email);
  }

  /** Emails links to every booking made with this address. Always succeeds, so it can't be used to probe for bookings. */
  @Post('trips/links')
  @HttpCode(202)
  async links(@Body() dto: TripLinksDto, @Req() request: AppRequest) {
    await this.rateLimit.consume(`trip-links:ip:${clientIp(request)}`, 5, 15 * 60, 'Too many requests. Please wait a few minutes.');
    await this.rateLimit.consume(`trip-links:email:${dto.email.toLowerCase()}`, 3, 60 * 60, 'We just sent that email. Please check your inbox.');
    await this.notifications.sendBookingLinks(dto.email);
    return { sent: true };
  }

  @Get('trips/:token')
  trip(@Param('token') token: string) {
    return this.bookings.guestView(assertToken(token));
  }

  @Post('trips/:token/cancel')
  @HttpCode(200)
  cancelTrip(@Param('token') token: string, @Body() dto: CancelBookingDto) {
    return this.bookings.cancelAsGuest(assertToken(token), dto.reason);
  }

  /** Guest backed out of payment and wants to release the held dates now. */
  @Post('trips/:token/abandon')
  @HttpCode(200)
  abandonTrip(@Param('token') token: string) {
    return this.bookings.abandonAsGuest(assertToken(token));
  }
}

@Controller('admin')
@UseGuards(SessionGuard)
export class AdminBookingsController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.bookings.dashboard();
  }

  @Get('bookings')
  list(@Query() query: AdminBookingsQuery) {
    return this.bookings.adminList(query);
  }

  @Get('bookings/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.adminGet(id);
  }

  @Post('bookings')
  async create(@Body() dto: StaffCreateBookingDto, @CurrentUser() user: AuthenticatedUser) {
    const { booking } = await this.bookings.create(dto, { source: BookingSource.STAFF, createdById: user.id });
    return this.bookings.adminGet(booking.id);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffCancelDto, @CurrentUser() user: AuthenticatedUser) {
    await this.bookings.cancel(id, { name: user.name, kind: 'host' }, { reason: dto.reason, refund: dto.refund ?? 'policy', refundAmount: dto.refundAmount });
    return this.bookings.adminGet(id);
  }

  @Get('bookings/:id/refund-preview')
  refundPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.refundPreview(id);
  }

  /** Partial or goodwill refund without cancelling. */
  @Post('bookings/:id/refunds')
  async refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IssueRefundDto, @CurrentUser() user: AuthenticatedUser) {
    await this.bookings.issueRefund(id, dto.amount, user.name, dto.note);
    return this.bookings.adminGet(id);
  }

  @Post('refunds/:refundId/retry')
  @HttpCode(200)
  retryRefund(@Param('refundId', ParseUUIDPipe) refundId: string) {
    return this.payments.retryRefund(refundId);
  }

  @Get('listings/:id/calendar')
  calendar(@Param('id', ParseUUIDPipe) id: string, @Query() query: CalendarQuery) {
    return this.availability.staffCalendar(id, query.from, query.to);
  }

  @Post('listings/:id/blocks')
  block(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateBlockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.availability.createBlock(id, dto, user.id);
  }

  @Delete('blocks/:holdId')
  @HttpCode(204)
  async unblock(@Param('holdId', ParseUUIDPipe) holdId: string) {
    await this.availability.removeBlock(holdId);
  }
}
