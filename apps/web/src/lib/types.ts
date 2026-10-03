export type ListingStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type LocationPrecision = 'EXACT' | 'APPROXIMATE';
export type CancellationPolicy = 'FLEXIBLE' | 'MODERATE' | 'STRICT';
export type UserRole = 'ADMIN' | 'MANAGER';

export type User = { id: string; email: string; name: string; role: UserRole };

export type PublicLocation = {
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
  radiusMeters: number;
};

export type Bounds = { north: number; south: number; east: number; west: number };

export type Media = {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  status: 'PENDING' | 'READY';
  url: string;
  thumbUrl: string;
  originalUrl: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  caption: string;
  position: number;
};

export type ListingCard = {
  id: string;
  title: string;
  summary: string;
  propertyType: string;
  city: string;
  region: string;
  country: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  nightlyPrice: number;
  cleaningFee: number;
  currency: string;
  ratingAverage: number | null;
  ratingCount: number;
  location: PublicLocation | null;
  images: { id: string; url: string; width: number | null; height: number | null }[];
  stayTotal: number | null;
  stayNights: number | null;
  createdAt: string;
};

export type SearchResponse = {
  items: ListingCard[];
  total: number;
  priceRange: { min: number; max: number };
};

export type Destination = {
  label: string;
  city: string;
  region: string;
  country: string;
  count: number;
  bounds: Bounds | null;
};

export type Place = {
  label: string;
  name: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
  type: string;
  bounds: Bounds | null;
};

export type PublicListing = {
  id: string;
  title: string;
  summary: string;
  description: string;
  propertyType: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  nightlyPrice: number;
  cleaningFee: number;
  currency: string;
  minNights: number;
  maxNights: number;
  checkInTime: string;
  checkOutTime: string;
  timeZone: string;
  houseRules: string;
  cancellationPolicy: CancellationPolicy;
  city: string;
  region: string;
  country: string;
  addressLine1: string;
  location: PublicLocation | null;
  locationDescription: string;
  ratingAverage: number | null;
  ratingCount: number;
  host: { name: string; since: string } | null;
  media: Media[];
  publishedAt: string | null;
};

export type DateSpan = { start: string; end: string };

/** `today` is the home's local date; the calendar uses it instead of the browser's. */
export type Availability = { minNights: number; maxNights: number; today: string; timeZone: string; unavailable: DateSpan[] };

export type Quote = {
  nights: number;
  nightlyPrice: number;
  nightsTotal: number;
  cleaningFee: number;
  total: number;
  currency: string;
};

export type QuoteResponse = { available: boolean; reason: string | null; quote: Quote | null };

export type ReviewCategoryKey = 'cleanliness' | 'accuracy' | 'communication' | 'location' | 'checkIn' | 'value';

export type ReviewsResponse = {
  summary: { average: number | null; count: number; categories: Record<ReviewCategoryKey, number | null> };
  items: { id: string; authorName: string; rating: number; comment: string; createdAt: string; stayedAt: string | null }[];
  page: number;
  pageSize: number;
  total: number;
};

export type RefundPreview = {
  paid: number;
  refundable: number;
  policyAmount: number;
  percent: number;
  rule: string;
  fullRefundUntil: string | null;
  policy: CancellationPolicy;
  policyText: string;
  currency: string;
  hasOnlinePayment: boolean;
};

export type Trip = {
  code: string;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  checkInAt: string;
  checkOutAt: string;
  nights: number;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  message: string;
  nightlyPrice: number;
  cleaningFee: number;
  totalPrice: number;
  currency: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: 'guest' | 'host' | null;
  canCancel: boolean;
  canReview: boolean;
  cancellation: RefundPreview | null;
  pendingPayment: { checkoutUrl: string | null; expiresAt: string } | null;
  payment: { amountPaid: number; amountRefunded: number; refundPending: number };
  review: { rating: number; comment: string; createdAt: string } | null;
  listing: {
    id: string;
    title: string;
    propertyType: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    latitude: number | null;
    longitude: number | null;
    checkInTime: string;
    checkOutTime: string;
    timeZone: string;
    timeZoneLabel: string;
    houseRules: string;
    cancellationPolicy: CancellationPolicy;
    coverUrl: string | null;
  };
};

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type AdminListingSummary = {
  id: string;
  title: string;
  status: ListingStatus;
  propertyType: string;
  city: string;
  region: string;
  country: string;
  nightlyPrice: number;
  currency: string;
  maxGuests: number;
  bedrooms: number;
  ratingAverage: number | null;
  ratingCount: number;
  coverUrl: string | null;
  host: { id: string; name: string } | null;
  upcomingBookings: number;
  updatedAt: string;
};

export type AdminListing = {
  id: string;
  status: ListingStatus;
  title: string;
  summary: string;
  description: string;
  propertyType: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  nightlyPrice: number;
  cleaningFee: number;
  currency: string;
  minNights: number;
  maxNights: number;
  checkInTime: string;
  checkOutTime: string;
  houseRules: string;
  cancellationPolicy: CancellationPolicy;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: LocationPrecision;
  locationDescription: string;
  timeZone: string;
  hostId: string | null;
  host: { id: string; name: string } | null;
  ratingAverage: number | null;
  ratingCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: Media[];
  publicLocation: PublicLocation | null;
};

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export type StaffBooking = {
  id: string;
  code: string;
  status: BookingStatus;
  source: 'WEBSITE' | 'STAFF';
  listing?: { id: string; title: string; city: string; timeZone: string };
  /** Today at the home, for "staying now" / "completed" labels. */
  listingToday: string | null;
  confirmedAt: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  message: string;
  nightlyPrice: number;
  cleaningFee: number;
  totalPrice: number;
  currency: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string;
  createdAt: string;
};

export type PaymentSummary = {
  provider: string;
  amountPaid: number;
  amountRefunded: number;
  refundPending: number;
  payments: { id: string; provider: string; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'; amount: number; currency: string; amountRefunded: number; providerPaymentId: string | null; paidAt: string | null; expiresAt: string; createdAt: string }[];
  refunds: { id: string; amount: number; status: 'PENDING' | 'SUCCEEDED' | 'FAILED'; reason: string; initiatedBy: string; failureMessage: string | null; createdAt: string }[];
};

export type StaffBookingDetail = StaffBooking & {
  createdBy: string | null;
  manageToken: string;
  review: { id: string; rating: number; comment: string; isHidden: boolean; createdAt: string } | null;
  termsVersion: { version: number; publishedAt: string } | null;
  privacyVersion: { version: number; publishedAt: string } | null;
  payment: PaymentSummary;
  emails: { id: string; template: string; toEmail: string; subject: string; status: EmailStatus; createdAt: string }[];
};

export type CalendarHold = {
  id: string;
  kind: 'BOOKING' | 'BLOCK';
  startDate: string;
  endDate: string;
  note: string;
  createdBy: string | null;
  booking: { id: string; code: string; status: BookingStatus; guestName: string; guests: number; totalPrice: number; currency: string; source: string } | null;
};

export type Dashboard = {
  listings: { published: number; drafts: number };
  upcomingBookings: number;
  guestsStayingNow: number;
  departingToday: number;
  pendingPayments: number;
  occupancyNext30: number;
  bookedNightsNext30: number;
  revenueNext30: { currency: string; total: number }[];
  arrivals: StaffBooking[];
  recent: StaffBooking[];
};

export type StaffUser = { id: string; email: string; name: string; role: UserRole; isActive: boolean; createdAt: string };

export type AdminReview = {
  id: string;
  listingId: string;
  authorName: string;
  rating: number;
  comment: string;
  isHidden: boolean;
  createdAt: string;
  listing: { id: string; title: string };
  booking: { id: string; code: string } | null;
};

export type EmailStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';

export type EmailSummary = {
  id: string;
  template: string;
  toEmail: string;
  toName: string;
  subject: string;
  status: EmailStatus;
  attempts: number;
  lastError: string | null;
  provider: string | null;
  sentAt: string | null;
  createdAt: string;
  bookingId: string | null;
};

export type EmailDetail = EmailSummary & { html: string; text: string };

export type LegalType = 'terms' | 'privacy';

export type LegalDocument = { type: 'TERMS' | 'PRIVACY'; version: number; title: string; content: string; publishedAt: string };

export type LegalVersionPeriod = { version: number; effectiveFrom: string; effectiveTo: string | null; changeNote: string };

export type LegalHistoryEntry = LegalVersionPeriod & {
  id: string;
  title: string;
  isCurrent: boolean;
  publishedBy: string | null;
  acceptedByBookings: number;
};
