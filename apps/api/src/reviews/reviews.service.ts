import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../common/db-errors';
import { zonedDateTimeToUtc } from '../common/timezone';
import type { CreateReviewDto } from './review.dto';

export const reviewCategories = ['cleanliness', 'accuracy', 'communication', 'location', 'checkIn', 'value'] as const;
const publicPageSize = 10;

const round = (value: number | null | undefined, digits = 2) =>
  value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList(listingId: string, page = 1) {
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, status: ListingStatus.PUBLISHED }, select: { id: true } });
    if (!listing) throw new NotFoundException('This home is not available.');
    const where = { listingId, isHidden: false };
    const [items, total, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * publicPageSize,
        take: publicPageSize,
        include: { booking: { select: { checkIn: true } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true, cleanliness: true, accuracy: true, communication: true, location: true, checkIn: true, value: true },
      }),
    ]);
    return {
      summary: {
        average: round(aggregate._avg.rating),
        count: total,
        categories: Object.fromEntries(reviewCategories.map((key) => [key, round(aggregate._avg[key], 1)])),
      },
      items: items.map((review) => ({
        id: review.id,
        authorName: review.authorName,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        stayedAt: review.booking?.checkIn ?? null,
      })),
      page,
      pageSize: publicPageSize,
      total,
    };
  }

  /** Guests review through their booking's manage token, once, after checkout. */
  async createFromBooking(token: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({ where: { manageToken: token }, include: { review: true, listing: true } });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.status !== BookingStatus.CONFIRMED) throw new BadRequestException('Cancelled stays cannot be reviewed.');
    if (new Date() < zonedDateTimeToUtc(booking.checkOut, booking.listing.checkOutTime, booking.listing.timeZone)) {
      throw new BadRequestException('You can leave a review after you check out.');
    }
    if (booking.review) throw new ConflictException('You have already reviewed this stay.');

    try {
      await this.prisma.review.create({
        data: {
          listingId: booking.listingId,
          bookingId: booking.id,
          authorName: booking.guestName.split(/\s+/)[0] || booking.guestName,
          rating: dto.rating,
          cleanliness: dto.cleanliness,
          accuracy: dto.accuracy,
          communication: dto.communication,
          location: dto.location,
          checkIn: dto.checkIn,
          value: dto.value,
          comment: dto.comment.trim(),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'bookingId')) throw new ConflictException('You have already reviewed this stay.');
      throw error;
    }
    await this.recomputeListingRating(booking.listingId);
  }

  async adminList(listingId?: string) {
    const reviews = await this.prisma.review.findMany({
      where: listingId ? { listingId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { listing: { select: { id: true, title: true } }, booking: { select: { id: true, code: true } } },
    });
    return reviews;
  }

  async setHidden(id: string, isHidden: boolean) {
    const review = await this.prisma.review.update({ where: { id }, data: { isHidden } }).catch(() => null);
    if (!review) throw new NotFoundException('Review not found.');
    await this.recomputeListingRating(review.listingId);
    return review;
  }

  /** Denormalized onto the listing so search can sort by rating cheaply. */
  async recomputeListingRating(listingId: string) {
    const aggregate = await this.prisma.review.aggregate({
      where: { listingId, isHidden: false },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.listing.update({
      where: { id: listingId },
      data: { ratingAverage: round(aggregate._avg.rating), ratingCount: aggregate._count._all },
    });
  }
}
