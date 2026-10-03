import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { nightsBetween, parseIsoDate, todayUtc } from '../common/dates';
import { adminListingDto, listingCardDto, publicListingDto } from './listing.mapper';
import { timeZoneForPoint } from '../common/timezone';
import type { SearchListingsQuery, UpdateListingDto } from './listing.dto';

const mediaOrder = { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] };
const hostSelect = { select: { id: true, name: true, createdAt: true } };

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  async search(query: SearchListingsQuery) {
    const and: Prisma.ListingWhereInput[] = [{ status: ListingStatus.PUBLISHED }];

    if (query.guests) and.push({ maxGuests: { gte: query.guests } });
    if (query.bedrooms) and.push({ bedrooms: { gte: query.bedrooms } });
    if (query.beds) and.push({ beds: { gte: query.beds } });
    if (query.bathrooms) and.push({ bathrooms: { gte: query.bathrooms } });
    if (query.minPrice != null) and.push({ nightlyPrice: { gte: query.minPrice } });
    if (query.maxPrice != null) and.push({ nightlyPrice: { lte: query.maxPrice } });
    if (query.types?.length) and.push({ propertyType: { in: query.types } });
    if (query.amenities?.length) and.push({ amenities: { hasEvery: query.amenities } });

    const { north, south, east, west } = query;
    if (north != null && south != null && east != null && west != null) {
      and.push({ latitude: { gte: Math.min(south, north), lte: Math.max(south, north) } });
      // A viewport can straddle the antimeridian, in which case west > east.
      and.push(
        west <= east
          ? { longitude: { gte: west, lte: east } }
          : { OR: [{ longitude: { gte: west } }, { longitude: { lte: east } }] },
      );
    }

    const words = (query.q ?? '').split(/[\s,]+/).map((word) => word.trim()).filter((word) => word.length > 1).slice(0, 6);
    for (const word of words) {
      const contains = { contains: word, mode: 'insensitive' as const };
      and.push({
        OR: [
          { title: contains }, { city: contains }, { region: contains }, { country: contains },
          { propertyType: contains }, { summary: contains },
        ],
      });
    }

    const checkIn = parseIsoDate(query.checkIn);
    const checkOut = parseIsoDate(query.checkOut);
    let stay: { nights: number } | undefined;
    if (checkIn && checkOut && checkOut > checkIn) {
      const nights = nightsBetween(checkIn, checkOut);
      stay = { nights };
      and.push(
        { minNights: { lte: nights } },
        { maxNights: { gte: nights } },
        // Available = no hold of any kind overlaps the requested nights.
        { holds: { none: { startDate: { lt: checkOut }, endDate: { gt: checkIn } } } },
      );
    }

    const orderBy: Prisma.ListingOrderByWithRelationInput[] = (() => {
      switch (query.sort) {
        case 'price_asc': return [{ nightlyPrice: 'asc' }];
        case 'price_desc': return [{ nightlyPrice: 'desc' }];
        case 'rating': return [{ ratingAverage: { sort: 'desc', nulls: 'last' } }, { ratingCount: 'desc' }];
        case 'newest': return [{ publishedAt: { sort: 'desc', nulls: 'last' } }];
        default: return [{ ratingCount: 'desc' }, { ratingAverage: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }];
      }
    })();

    const [listings, priceStats] = await Promise.all([
      this.prisma.listing.findMany({
        where: { AND: and },
        orderBy: [...orderBy, { id: 'asc' }],
        take: 300,
        include: { media: { where: { kind: 'IMAGE', status: 'READY' }, ...mediaOrder, take: 6 } },
      }),
      this.prisma.listing.aggregate({
        where: { status: ListingStatus.PUBLISHED },
        _min: { nightlyPrice: true },
        _max: { nightlyPrice: true },
      }),
    ]);

    return {
      items: listings.map((listing) => listingCardDto(this.storage, listing, stay)),
      total: listings.length,
      priceRange: { min: priceStats._min.nightlyPrice ?? 0, max: priceStats._max.nightlyPrice ?? 0 },
    };
  }

  /** Destination suggestions drawn from where published listings actually are. */
  async destinations(q: string) {
    const term = q.trim();
    const contains = { contains: term, mode: 'insensitive' as const };
    const groups = await this.prisma.listing.groupBy({
      by: ['city', 'region', 'country'],
      where: {
        status: ListingStatus.PUBLISHED,
        ...(term ? { OR: [{ city: contains }, { region: contains }, { country: contains }] } : {}),
      },
      _count: { _all: true },
      _min: { latitude: true, longitude: true },
      _max: { latitude: true, longitude: true },
      orderBy: { _count: { id: 'desc' } },
      take: 6,
    });
    return groups
      .filter((group) => group.city || group.region || group.country)
      .map((group) => ({
        label: [group.city, group.region, group.country].filter(Boolean).join(', '),
        city: group.city,
        region: group.region,
        country: group.country,
        count: group._count._all,
        bounds:
          group._min.latitude != null && group._max.latitude != null && group._min.longitude != null && group._max.longitude != null
            ? { south: group._min.latitude, north: group._max.latitude, west: group._min.longitude, east: group._max.longitude }
            : null,
      }));
  }

  async publicDetail(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, status: ListingStatus.PUBLISHED },
      include: { media: { where: { status: 'READY' }, ...mediaOrder }, host: hostSelect },
    });
    if (!listing) throw new NotFoundException('This home is not available.');
    return publicListingDto(this.storage, listing);
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  async adminList() {
    const today = todayUtc();
    const listings = await this.prisma.listing.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        media: { where: { kind: 'IMAGE', status: 'READY' }, ...mediaOrder, take: 1 },
        host: hostSelect,
        _count: { select: { bookings: { where: { status: 'CONFIRMED', checkOut: { gt: today } } } } },
      },
    });
    return listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      status: listing.status,
      propertyType: listing.propertyType,
      city: listing.city,
      region: listing.region,
      country: listing.country,
      nightlyPrice: listing.nightlyPrice,
      currency: listing.currency,
      maxGuests: listing.maxGuests,
      bedrooms: listing.bedrooms,
      ratingAverage: listing.ratingAverage,
      ratingCount: listing.ratingCount,
      coverUrl: listing.media[0] ? this.storage.publicUrl(listing.media[0].thumbKey ?? listing.media[0].storageKey) : null,
      host: listing.host ? { id: listing.host.id, name: listing.host.name } : null,
      upcomingBookings: listing._count.bookings,
      updatedAt: listing.updatedAt,
    }));
  }

  async adminGet(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { media: mediaOrder, host: hostSelect },
    });
    if (!listing) throw new NotFoundException('Listing not found.');
    return adminListingDto(this.storage, listing);
  }

  async create(title: string, hostId: string) {
    const listing = await this.prisma.listing.create({ data: { title, hostId } });
    return this.adminGet(listing.id);
  }

  async update(id: string, dto: UpdateListingDto) {
    const existing = await this.prisma.listing.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Listing not found.');

    const data = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)) as UpdateListingDto;
    const merged = { ...existing, ...data };

    if (merged.maxNights < merged.minNights) {
      throw new BadRequestException('Maximum nights must be greater than or equal to minimum nights.');
    }
    if ((merged.latitude == null) !== (merged.longitude == null)) {
      throw new BadRequestException('Latitude and longitude must be set together.');
    }
    // Keep the home's time zone in step with its location unless staff chose one explicitly.
    const moved =
      (data.latitude !== undefined && data.latitude !== existing.latitude) || (data.longitude !== undefined && data.longitude !== existing.longitude);
    if (moved && !data.timeZone && merged.latitude != null && merged.longitude != null) {
      data.timeZone = timeZoneForPoint(merged.latitude, merged.longitude);
    }

    if (data.hostId) {
      const host = await this.prisma.user.findFirst({ where: { id: data.hostId, isActive: true } });
      if (!host) throw new BadRequestException('Host must be an active staff member.');
    }

    let publishedAt = existing.publishedAt;
    if (merged.status === ListingStatus.PUBLISHED) {
      await this.assertPublishable(id, merged);
      if (existing.status !== ListingStatus.PUBLISHED) publishedAt = new Date();
    }

    await this.prisma.listing.update({ where: { id }, data: { ...data, publishedAt } });
    return this.adminGet(id);
  }

  async remove(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id }, include: { _count: { select: { bookings: true } } } });
    if (!listing) throw new NotFoundException('Listing not found.');
    if (listing._count.bookings > 0) {
      throw new ConflictException('This listing has booking history, so it cannot be deleted. Archive it instead.');
    }
    await this.prisma.listing.delete({ where: { id } });
    await this.storage.deletePrefix(`listings/${id}/`);
  }

  private async assertPublishable(
    id: string,
    listing: { title: string; description: string; nightlyPrice: number; latitude: number | null | undefined; city: string },
  ) {
    const problems: string[] = [];
    if (!listing.title.trim()) problems.push('a title');
    if (listing.description.trim().length < 20) problems.push('a description (at least 20 characters)');
    if (listing.nightlyPrice <= 0) problems.push('a nightly price');
    if (listing.latitude == null) problems.push('a map location');
    if (!listing.city.trim()) problems.push('a city');
    const photos = await this.prisma.listingMedia.count({ where: { listingId: id, kind: 'IMAGE', status: 'READY' } });
    if (photos === 0) problems.push('at least one photo');
    if (problems.length) {
      throw new BadRequestException(`Before publishing, add ${problems.join(', ')}.`);
    }
  }
}
