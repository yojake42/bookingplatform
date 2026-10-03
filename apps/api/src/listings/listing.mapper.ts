import type { Listing, ListingMedia, User } from '@prisma/client';
import { createHash } from 'crypto';
import type { StorageService } from '../storage/storage.service';

/** Approximate pins are offset by up to this many meters... */
const maxOffsetMeters = 450;
/** ...and drawn as a circle of this radius, which always contains the real location. */
export const approximateRadiusMeters = 650;

export function mediaDto(storage: StorageService, media: ListingMedia) {
  const originalUrl = storage.publicUrl(media.storageKey);
  const url = media.largeKey ? storage.publicUrl(media.largeKey) : originalUrl;
  return {
    id: media.id,
    kind: media.kind,
    status: media.status,
    url,
    thumbUrl: media.thumbKey ? storage.publicUrl(media.thumbKey) : url,
    originalUrl,
    contentType: media.contentType,
    fileName: media.fileName,
    sizeBytes: media.sizeBytes,
    width: media.width,
    height: media.height,
    caption: media.caption,
    position: media.position,
  };
}

export type MediaDto = ReturnType<typeof mediaDto>;

/**
 * Coordinates safe to show the public. Approximate listings get a deterministic offset derived from
 * the listing id, so the circle does not "move" between requests (which would let someone average
 * repeated responses to recover the real point).
 */
export function publicLocation(listing: Pick<Listing, 'id' | 'latitude' | 'longitude' | 'locationPrecision'>) {
  if (listing.latitude == null || listing.longitude == null) return null;
  if (listing.locationPrecision === 'EXACT') {
    return { latitude: listing.latitude, longitude: listing.longitude, precision: 'EXACT' as const, radiusMeters: 0 };
  }
  const hash = createHash('sha256').update(`location:${listing.id}`).digest();
  const angle = (hash.readUInt16BE(0) / 0xffff) * 2 * Math.PI;
  const distance = 120 + (hash.readUInt16BE(2) / 0xffff) * (maxOffsetMeters - 120);
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((listing.latitude * Math.PI) / 180);
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  return {
    latitude: round(listing.latitude + (distance * Math.cos(angle)) / metersPerDegreeLat),
    longitude: round(listing.longitude + (distance * Math.sin(angle)) / Math.max(metersPerDegreeLng, 1)),
    precision: 'APPROXIMATE' as const,
    radiusMeters: approximateRadiusMeters,
  };
}

type CardListing = Listing & { media: ListingMedia[] };

export function listingCardDto(storage: StorageService, listing: CardListing, stay?: { nights: number }) {
  const images = listing.media.filter((media) => media.kind === 'IMAGE' && media.status === 'READY').slice(0, 6);
  return {
    id: listing.id,
    title: listing.title,
    summary: listing.summary,
    propertyType: listing.propertyType,
    city: listing.city,
    region: listing.region,
    country: listing.country,
    maxGuests: listing.maxGuests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    bathrooms: listing.bathrooms,
    nightlyPrice: listing.nightlyPrice,
    cleaningFee: listing.cleaningFee,
    currency: listing.currency,
    ratingAverage: listing.ratingAverage,
    ratingCount: listing.ratingCount,
    location: publicLocation(listing),
    images: images.map((media) => ({
      id: media.id,
      url: storage.publicUrl(media.thumbKey ?? media.largeKey ?? media.storageKey),
      width: media.width,
      height: media.height,
    })),
    stayTotal: stay ? listing.nightlyPrice * stay.nights + listing.cleaningFee : null,
    stayNights: stay?.nights ?? null,
    createdAt: listing.createdAt,
  };
}

type DetailListing = Listing & { media: ListingMedia[]; host: Pick<User, 'id' | 'name' | 'createdAt'> | null };

export function publicListingDto(storage: StorageService, listing: DetailListing) {
  const exact = listing.locationPrecision === 'EXACT';
  return {
    id: listing.id,
    title: listing.title,
    summary: listing.summary,
    description: listing.description,
    propertyType: listing.propertyType,
    maxGuests: listing.maxGuests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    bathrooms: listing.bathrooms,
    amenities: listing.amenities,
    nightlyPrice: listing.nightlyPrice,
    cleaningFee: listing.cleaningFee,
    currency: listing.currency,
    minNights: listing.minNights,
    maxNights: listing.maxNights,
    checkInTime: listing.checkInTime,
    checkOutTime: listing.checkOutTime,
    timeZone: listing.timeZone,
    houseRules: listing.houseRules,
    cancellationPolicy: listing.cancellationPolicy,
    city: listing.city,
    region: listing.region,
    country: listing.country,
    // Street address is only public when the host opted into an exact location.
    addressLine1: exact ? listing.addressLine1 : '',
    location: publicLocation(listing),
    locationDescription: listing.locationDescription,
    ratingAverage: listing.ratingAverage,
    ratingCount: listing.ratingCount,
    host: listing.host ? { name: listing.host.name, since: listing.host.createdAt } : null,
    media: listing.media.filter((media) => media.status === 'READY').map((media) => mediaDto(storage, media)),
    publishedAt: listing.publishedAt,
  };
}

export function adminListingDto(storage: StorageService, listing: DetailListing) {
  const { host, media, ...rest } = listing;
  return {
    ...rest,
    host: host ? { id: host.id, name: host.name } : null,
    media: media.map((item) => mediaDto(storage, item)),
    publicLocation: publicLocation(listing),
  };
}
