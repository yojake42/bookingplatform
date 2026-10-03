import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CreateReviewDto, ModerateReviewDto } from './review.dto';
import { ReviewsService } from './reviews.service';

@Controller('public')
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('listings/:id/reviews')
  list(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string) {
    const pageNumber = Math.max(1, Math.min(1000, Number.parseInt(page ?? '1', 10) || 1));
    return this.reviews.publicList(id, pageNumber);
  }

  @Post('trips/:token/review')
  @HttpCode(204)
  async create(@Param('token') token: string, @Body() dto: CreateReviewDto) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException('Booking not found.');
    await this.reviews.createFromBooking(token, dto);
  }
}

@Controller('admin/reviews')
@UseGuards(SessionGuard)
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query('listingId') listingId?: string) {
    return this.reviews.adminList(listingId && /^[0-9a-f-]{36}$/i.test(listingId) ? listingId : undefined);
  }

  @Patch(':id')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.setHidden(id, dto.isHidden);
  }
}
