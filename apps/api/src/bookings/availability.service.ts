import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HoldKind, ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, mergeRanges, nightsBetween, parseIsoDate, toIsoDate } from '../common/dates';
import { isHoldOverlapError, lockListingCalendar } from '../common/db-errors';
import { quoteStay, validateStay } from '../common/stay';
import { localToday, localTodayIso } from '../common/timezone';

const maxCalendarSpanDays = 800;

function parseSpan(from: string, to: string) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || end <= start) throw new BadRequestException('Provide a valid date range.');
  if (nightsBetween(start, end) > maxCalendarSpanDays) throw new BadRequestException('Date range is too long.');
  return { start, end };
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Unavailable nights for the public calendar. Bookings and manual blocks look identical to guests. */
  async publicAvailability(listingId: string, from: string, to: string) {
    const { start, end } = parseSpan(from, to);
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: ListingStatus.PUBLISHED },
      select: { minNights: true, maxNights: true, timeZone: true },
    });
    if (!listing) throw new NotFoundException('This home is not available.');
    const holds = await this.prisma.calendarHold.findMany({
      where: { listingId, startDate: { lt: end }, endDate: { gt: start } },
      select: { startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
    return {
      minNights: listing.minNights,
      /** The home's local date: the calendar must not offer nights that have already started there. */
      today: localTodayIso(listing.timeZone),
      timeZone: listing.timeZone,
      maxNights: listing.maxNights,
      unavailable: mergeRanges(holds.map((hold) => ({ start: hold.startDate, end: hold.endDate }))).map((range) => ({
        start: toIsoDate(range.start),
        end: toIsoDate(range.end),
      })),
    };
  }

  /** Price and availability for a prospective stay; never throws for a "no", so the UI can explain why. */
  async quote(listingId: string, input: { checkIn: string; checkOut: string; guests: number }) {
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, status: ListingStatus.PUBLISHED } });
    if (!listing) throw new NotFoundException('This home is not available.');
    const result = validateStay(listing, input, { enforceNightLimits: true, today: localToday(listing.timeZone) });
    if (!result.ok) return { available: false, reason: result.message, quote: null };
    const conflict = await this.findConflict(listingId, result.stay.checkIn, result.stay.checkOut);
    const quote = quoteStay(listing, result.stay.nights);
    if (conflict) return { available: false, reason: 'Those dates are no longer available.', quote };
    return { available: true, reason: null, quote };
  }

  async findConflict(listingId: string, start: Date, end: Date) {
    return this.prisma.calendarHold.findFirst({
      where: { listingId, startDate: { lt: end }, endDate: { gt: start } },
      orderBy: { startDate: 'asc' },
    });
  }

  // -------------------------------------------------------------------------
  // Staff calendar
  // -------------------------------------------------------------------------

  async staffCalendar(listingId: string, from: string, to: string) {
    const { start, end } = parseSpan(from, to);
    const holds = await this.prisma.calendarHold.findMany({
      where: { listingId, startDate: { lt: end }, endDate: { gt: start } },
      orderBy: { startDate: 'asc' },
      include: {
        createdBy: { select: { name: true } },
        booking: { select: { id: true, code: true, status: true, guestName: true, guests: true, totalPrice: true, currency: true, source: true } },
      },
    });
    return holds.map((hold) => ({
      id: hold.id,
      kind: hold.kind,
      startDate: toIsoDate(hold.startDate),
      endDate: toIsoDate(hold.endDate),
      note: hold.note,
      createdBy: hold.createdBy?.name ?? null,
      booking: hold.booking,
    }));
  }

  async createBlock(listingId: string, input: { startDate: string; endDate: string; note?: string }, userId: string) {
    const start = parseIsoDate(input.startDate);
    const end = parseIsoDate(input.endDate);
    if (!start || !end || end <= start) throw new BadRequestException('Choose a valid range of nights to block.');
    if (nightsBetween(start, end) > 730) throw new BadRequestException('Blocks can cover at most two years at a time.');
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } });
    if (!listing) throw new NotFoundException('Listing not found.');

    // Friendly pre-check; the exclusion constraint below is what actually guarantees correctness.
    const conflict = await this.findConflict(listingId, start, end);
    if (conflict) throw this.conflictError(conflict);

    try {
      const hold = await this.prisma.$transaction(async (tx) => {
        await lockListingCalendar(tx, listingId);
        return tx.calendarHold.create({
          data: { listingId, kind: HoldKind.BLOCK, startDate: start, endDate: end, note: input.note?.trim() ?? '', createdById: userId },
        });
      });
      return { id: hold.id, kind: hold.kind, startDate: toIsoDate(hold.startDate), endDate: toIsoDate(hold.endDate), note: hold.note };
    } catch (error) {
      if (isHoldOverlapError(error)) {
        const latest = await this.findConflict(listingId, start, end);
        throw latest ? this.conflictError(latest) : new ConflictException('Those nights were just taken. Refresh the calendar.');
      }
      throw error;
    }
  }

  async removeBlock(holdId: string) {
    const hold = await this.prisma.calendarHold.findUnique({ where: { id: holdId } });
    if (!hold) throw new NotFoundException('Block not found.');
    if (hold.kind !== HoldKind.BLOCK) {
      throw new BadRequestException('Booked nights are released by cancelling the booking.');
    }
    await this.prisma.calendarHold.delete({ where: { id: holdId } });
  }

  private conflictError(hold: { kind: HoldKind; startDate: Date; endDate: Date }) {
    const what = hold.kind === HoldKind.BOOKING ? 'a booking' : 'a blocked period';
    const lastNight = toIsoDate(addDays(hold.endDate, -1));
    return new ConflictException(`Those dates overlap ${what} (nights ${toIsoDate(hold.startDate)} through ${lastNight}).`);
  }
}
