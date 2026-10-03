import { addDays, nightsBetween, parseIsoDate } from './dates';

export type StayRules = {
  maxGuests: number;
  minNights: number;
  maxNights: number;
};

export type PriceInputs = {
  nightlyPrice: number;
  cleaningFee: number;
  currency: string;
};

export type Quote = {
  nights: number;
  nightlyPrice: number;
  nightsTotal: number;
  cleaningFee: number;
  total: number;
  currency: string;
};

export type ParsedStay = { checkIn: Date; checkOut: Date; nights: number };

/** Furthest ahead a stay may start. */
export const bookingHorizonDays = 730;

/**
 * Validates a requested stay against a listing's rules. Returns an error message, or the parsed stay.
 * `enforceNightLimits` is relaxed for staff-created bookings, which may bend min/max-night rules.
 * `today` is the calendar date at the home (see localToday), so "tonight" means tonight where the home is.
 */
export function validateStay(
  rules: StayRules,
  input: { checkIn: string; checkOut: string; guests: number },
  options: { enforceNightLimits: boolean; today: Date },
): { ok: true; stay: ParsedStay } | { ok: false; message: string } {
  const checkIn = parseIsoDate(input.checkIn);
  const checkOut = parseIsoDate(input.checkOut);
  if (!checkIn || !checkOut) return { ok: false, message: 'Dates must be valid YYYY-MM-DD values.' };
  if (checkOut.getTime() <= checkIn.getTime()) return { ok: false, message: 'Check-out must be after check-in.' };

  const { today } = options;
  if (checkIn.getTime() < today.getTime()) return { ok: false, message: 'Check-in cannot be in the past.' };
  if (checkIn.getTime() > addDays(today, bookingHorizonDays).getTime()) {
    return { ok: false, message: 'Bookings can be made up to two years in advance.' };
  }

  if (!Number.isInteger(input.guests) || input.guests < 1) return { ok: false, message: 'At least one guest is required.' };
  if (input.guests > rules.maxGuests) {
    return { ok: false, message: `This home allows up to ${rules.maxGuests} guest${rules.maxGuests === 1 ? '' : 's'}.` };
  }

  const nights = nightsBetween(checkIn, checkOut);
  if (options.enforceNightLimits) {
    if (nights < rules.minNights) return { ok: false, message: `This home has a ${rules.minNights}-night minimum.` };
    if (nights > rules.maxNights) return { ok: false, message: `Stays are limited to ${rules.maxNights} nights.` };
  }
  if (nights > 365) return { ok: false, message: 'Stays are limited to 365 nights.' };

  return { ok: true, stay: { checkIn, checkOut, nights } };
}

export function quoteStay(prices: PriceInputs, nights: number): Quote {
  const nightsTotal = prices.nightlyPrice * nights;
  return {
    nights,
    nightlyPrice: prices.nightlyPrice,
    nightsTotal,
    cleaningFee: prices.cleaningFee,
    total: nightsTotal + prices.cleaningFee,
    currency: prices.currency,
  };
}
