/**
 * Idempotent seed:
 *  - always ensures an ADMIN account exists (from SEED_ADMIN_* env vars);
 *  - when SEED_DEMO_DATA=true and there are no listings yet, adds demo homes with photos,
 *    bookings, blocks and reviews (dates relative to today so the demo never goes stale).
 */
import { BookingSource, BookingStatus, HoldKind, LegalDocumentType, ListingStatus, LocationPrecision, MediaKind, MediaStatus, PaymentStatus, PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import { StorageService } from '../src/storage/storage.service';
import { renderImageVariants } from '../src/media/media.service';
import { addDays, todayUtc } from '../src/common/dates';
import { timeZoneForPoint } from '../src/common/timezone';
import { defaultPrivacy, defaultTerms } from './legal-defaults';

const prisma = new PrismaClient();

const env = (key: string, fallback?: string) => process.env[key] ?? fallback;
const storage = new StorageService({
  get: (key: string, fallback?: string) => env(key, fallback),
  getOrThrow: (key: string) => {
    const value = env(key);
    if (!value) throw new Error(`Missing ${key}`);
    return value;
  },
} as never);

async function ensureAdmin() {
  const existing = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
  if (existing) return existing;
  const email = env('SEED_ADMIN_EMAIL');
  const password = env('SEED_ADMIN_PASSWORD');
  if (!email || !password) throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to create the first admin.');
  const admin = await prisma.user.create({
    data: { email: email.toLowerCase(), name: env('SEED_ADMIN_NAME', 'Site Admin')!, role: UserRole.ADMIN, passwordHash: await argon2.hash(password) },
  });
  console.log(`Created admin ${admin.email}`);
  return admin;
}

type DemoListing = {
  title: string;
  summary: string;
  description: string;
  propertyType: string;
  city: string;
  region: string;
  country: string;
  addressLine1: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  nightly: number;
  cleaning: number;
  minNights: number;
  amenities: string[];
  photos: string[];
  locationDescription: string;
};

const commonAmenities = ['wifi', 'kitchen', 'heating', 'smoke_alarm', 'carbon_monoxide_alarm', 'essentials', 'hair_dryer', 'self_check_in'];

const demoListings: DemoListing[] = [
  {
    title: 'Cliffside Glass House with Infinity Pool',
    summary: 'Floor-to-ceiling Pacific views, minutes from Zuma Beach',
    description:
      'Perched above the coastline, this architect-designed glass house frames the ocean from nearly every room. Mornings start with coffee on the cantilevered deck; evenings end with sunset swims in the heated infinity pool.\n\nThe open-plan living space flows into a chef\'s kitchen with a long marble island, and each bedroom has its own terrace. Zuma Beach and the best of Malibu\'s restaurants are a short drive down the hill.',
    propertyType: 'Villa', city: 'Malibu', region: 'California', country: 'United States', addressLine1: '31500 Pacific Coast Hwy', postalCode: '90265',
    latitude: 34.0259, longitude: -118.7798, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 8, bedrooms: 4, beds: 5, bathrooms: 4.5, nightly: 89500, cleaning: 35000, minNights: 3,
    amenities: [...commonAmenities, 'pool', 'hot_tub', 'ocean_view', 'free_parking', 'air_conditioning', 'workspace', 'tv', 'washer', 'dryer', 'bbq_grill', 'patio', 'outdoor_dining'],
    photos: ['1613490493576-7fde63acd811', '1600573472550-8090b5e0745e', '1600607687939-ce8a6c25118c', '1631049307264-da0ec9d70304', '1584622650111-993a426fbf0a'],
    locationDescription: 'A quiet hillside street above the PCH. Zuma Beach is 6 minutes by car; Point Dume hiking trails are a 10-minute walk.',
  },
  {
    title: 'Palm Courtyard Pool Villa',
    summary: 'Mid-century calm with a private saltwater pool',
    description:
      'A sun-drenched mid-century villa wrapped around a private courtyard pool and lounge deck. Inside, terrazzo floors, original wood ceilings and curated vintage pieces keep things cool even at noon.\n\nWalk to the Uptown Design District for coffee and galleries, then come home to the mountains turning pink at sunset.',
    propertyType: 'Villa', city: 'Palm Springs', region: 'California', country: 'United States', addressLine1: '1100 N Palm Canyon Dr', postalCode: '92262',
    latitude: 33.8303, longitude: -116.5453, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 6, bedrooms: 3, beds: 3, bathrooms: 2, nightly: 42500, cleaning: 18000, minNights: 2,
    amenities: [...commonAmenities, 'pool', 'hot_tub', 'air_conditioning', 'free_parking', 'mountain_view', 'bbq_grill', 'patio', 'outdoor_dining', 'tv', 'washer', 'dryer'],
    photos: ['1564013799919-ab600027ffc6', '1416331108676-a22ccb276e35', '1617806118233-18e1de247200', '1505693416388-ac5ce068fe85', '1600566752355-35792bedcfea'],
    locationDescription: 'In the Movie Colony neighborhood, a 12-minute walk to downtown Palm Springs.',
  },
  {
    title: 'Snowline Chalet near Northstar',
    summary: 'Wood-fired evenings and ski-in access in Tahoe',
    description:
      'A classic alpine chalet tucked into the pines with ski-in access to Northstar\'s lower runs. After the lifts close, gather around the stone fireplace or soak in the cedar hot tub under the stars.\n\nIn summer, Lake Tahoe\'s beaches and mountain-bike trails are minutes away.',
    propertyType: 'Chalet', city: 'Truckee', region: 'California', country: 'United States', addressLine1: '2200 North Village Dr', postalCode: '96161',
    latitude: 39.274, longitude: -120.121, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 10, bedrooms: 4, beds: 6, bathrooms: 3, nightly: 61000, cleaning: 25000, minNights: 2,
    amenities: [...commonAmenities, 'fireplace', 'hot_tub', 'ski_in_out', 'mountain_view', 'free_parking', 'washer', 'dryer', 'tv', 'game_room', 'crib', 'high_chair'],
    photos: ['1510798831971-661eb04b3739', '1501183638710-841dd1904471', '1484154218962-a197022b5858', '1595526114035-0d45ed16cfbf', '1552321554-5fefe8c9ef14'],
    locationDescription: 'Ski-in access from the backyard; Truckee\'s historic downtown is a 15-minute drive.',
  },
  {
    title: 'Hidden Fern Log Cabin',
    summary: 'A slow-living hideaway in the Blue Ridge forest',
    description:
      'Hand-built from reclaimed timber, this cozy log cabin sits on six wooded acres with a creek running along the property line. Read on the wraparound porch, cook a long dinner in the farmhouse kitchen, and fall asleep to the sound of the water.\n\nDowntown Asheville\'s breweries and the Blue Ridge Parkway are each about 20 minutes away.',
    propertyType: 'Cabin', city: 'Asheville', region: 'North Carolina', country: 'United States', addressLine1: '48 Laurel Creek Rd', postalCode: '28804',
    latitude: 35.6505, longitude: -82.5615, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 1, nightly: 18900, cleaning: 9500, minNights: 2,
    amenities: [...commonAmenities, 'fireplace', 'fire_pit', 'patio', 'free_parking', 'pets_allowed', 'bbq_grill', 'mountain_view'],
    photos: ['1587061949409-02df41d5e562', '1542718610-a1d656d1884c', '1560185007-cde436f6a4d0', '1615874959474-d609969a20ed', '1560184897-ae75f418493e'],
    locationDescription: 'Private and wooded, at the end of a gravel lane. A car is recommended.',
  },
  {
    title: 'Sunlit SoHo Loft',
    summary: 'Cast-iron loft with 14-foot ceilings on a cobblestone block',
    description:
      'A true SoHo loft in a landmark cast-iron building: oversized arched windows, exposed brick, and a calm, plant-filled living room. The bedroom is tucked away from the street for quiet nights.\n\nYou are steps from galleries, boutiques and some of the best restaurants in the city, with the subway two blocks away.',
    propertyType: 'Loft', city: 'New York', region: 'New York', country: 'United States', addressLine1: '112 Greene St', postalCode: '10012',
    latitude: 40.7246, longitude: -73.9993, precision: LocationPrecision.EXACT,
    maxGuests: 3, bedrooms: 1, beds: 2, bathrooms: 1, nightly: 34500, cleaning: 12000, minNights: 3,
    amenities: [...commonAmenities, 'workspace', 'air_conditioning', 'tv', 'washer', 'dryer', 'long_term_stays', 'luggage_dropoff'],
    photos: ['1502672260266-1c1ef2d93688', '1522708323590-d24dbb6b0267', '1493809842364-78817add7ffb', '1540518614846-7eded433c457', '1586023492125-27b2c045efd7'],
    locationDescription: 'Greene Street between Prince and Spring. Prince St (R/W) station is a 3-minute walk.',
  },
  {
    title: 'Harborview Modern Apartment',
    summary: 'Elliott Bay views two blocks from Pike Place',
    description:
      'A bright corner apartment high above the waterfront, with views across Elliott Bay to the Olympic Mountains. The kitchen is fully stocked, the bed is excellent, and the workspace faces the water.\n\nWalk to Pike Place Market, the Seattle Art Museum and the ferry terminal.',
    propertyType: 'Apartment', city: 'Seattle', region: 'Washington', country: 'United States', addressLine1: '1521 2nd Ave', postalCode: '98101',
    latitude: 47.6097, longitude: -122.3422, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 2, nightly: 22900, cleaning: 9000, minNights: 1,
    amenities: [...commonAmenities, 'workspace', 'gym', 'tv', 'washer', 'dryer', 'ocean_view', 'ev_charger', 'long_term_stays'],
    photos: ['1560448204-e02f11c3d0e2', '1554995207-c18c203602cb', '1600210492486-724fe5c67fb0', '1600607687644-c7171b42498f', '1600566752355-35792bedcfea'],
    locationDescription: 'Downtown Seattle; Pike Place Market is a 4-minute walk.',
  },
  {
    title: 'Hudson Valley Farmhouse',
    summary: 'Restored 1890s farmhouse with orchard views',
    description:
      'A lovingly restored farmhouse on ten acres of apple orchard. Long farm-table dinners, a clawfoot tub, wide-plank floors and a porch made for doing nothing at all.\n\nThe town of Hudson\'s antique shops and restaurants are 10 minutes away, and the Amtrak station makes it an easy trip from the city.',
    propertyType: 'House', city: 'Hudson', region: 'New York', country: 'United States', addressLine1: '312 Orchard Ln', postalCode: '12534',
    latitude: 42.2529, longitude: -73.791, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 8, bedrooms: 4, beds: 5, bathrooms: 2.5, nightly: 38500, cleaning: 20000, minNights: 2,
    amenities: [...commonAmenities, 'fireplace', 'fire_pit', 'free_parking', 'washer', 'dryer', 'bbq_grill', 'patio', 'pets_allowed', 'crib', 'piano'],
    photos: ['1570129477492-45c003edd2be', '1600210492486-724fe5c67fb0', '1560185007-cde436f6a4d0', '1505693416388-ac5ce068fe85', '1552321554-5fefe8c9ef14'],
    locationDescription: 'Rural and peaceful; Hudson\'s Warren Street is a 10-minute drive.',
  },
  {
    title: 'Red Meadow Cottage',
    summary: 'A storybook cottage on the Door County shore',
    description:
      'A tiny red cottage set alone on a wildflower meadow that runs down to the bay. Simple, bright and quiet, with a wood stove for cool evenings and a picnic table for long lake-light dinners.\n\nCherry orchards, lighthouses and the shops of Fish Creek are all close by.',
    propertyType: 'Cottage', city: 'Fish Creek', region: 'Wisconsin', country: 'United States', addressLine1: '9120 Meadow Rd', postalCode: '54212',
    latitude: 45.1283, longitude: -87.244, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 2, bedrooms: 1, beds: 1, bathrooms: 1, nightly: 14500, cleaning: 6000, minNights: 2,
    amenities: [...commonAmenities, 'fireplace', 'waterfront', 'lake_access', 'free_parking', 'patio'],
    photos: ['1518780664697-55e3ad937233', '1505691938895-1758d7feb511', '1513694203232-719a280e022f', '1595526114035-0d45ed16cfbf'],
    locationDescription: 'On the bay side of the peninsula, 5 minutes north of Fish Creek.',
  },
  {
    title: 'Desert Modern Retreat',
    summary: 'Concrete, glass and a cowboy pool under endless stars',
    description:
      'A minimalist retreat among the boulders, minutes from the west entrance of Joshua Tree National Park. Floor-to-ceiling glass looks out onto the desert, and the plunge pool and outdoor shower make the most of warm nights.\n\nBring a telescope: the skies here are some of the darkest in Southern California.',
    propertyType: 'House', city: 'Joshua Tree', region: 'California', country: 'United States', addressLine1: '61700 Desert Star Rd', postalCode: '92252',
    latitude: 34.1347, longitude: -116.3131, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 2, nightly: 27500, cleaning: 12500, minNights: 2,
    amenities: [...commonAmenities, 'pool', 'hot_tub', 'air_conditioning', 'fire_pit', 'free_parking', 'patio', 'mountain_view', 'workspace'],
    photos: ['1580587771525-78b9dba3b914', '1600585154340-be6161a56a0c', '1598928506311-c55ded91a20c', '1600607687644-c7171b42498f', '1584622650111-993a426fbf0a'],
    locationDescription: 'Five minutes to the park\'s west entrance; the last mile is a graded dirt road.',
  },
  {
    title: 'Ivy Brick Cottage in the Historic District',
    summary: 'Garden cottage on a gas-lit lane South of Broad',
    description:
      'A 19th-century brick carriage house wrapped in ivy, with a private walled garden and a piazza for morning coffee. Inside: heart-pine floors, a deep soaking tub and a sunny reading nook.\n\nEverything in Charleston\'s historic district — restaurants, the Battery, King Street shopping — is a pleasant walk away.',
    propertyType: 'Cottage', city: 'Charleston', region: 'South Carolina', country: 'United States', addressLine1: '24 Lamboll St', postalCode: '29401',
    latitude: 32.7718, longitude: -79.9352, precision: LocationPrecision.EXACT,
    maxGuests: 3, bedrooms: 1, beds: 2, bathrooms: 1.5, nightly: 26500, cleaning: 10000, minNights: 2,
    amenities: [...commonAmenities, 'air_conditioning', 'patio', 'outdoor_dining', 'tv', 'washer', 'dryer', 'workspace'],
    photos: ['1588880331179-bc9b93a8cb5e', '1560184897-ae75f418493e', '1600210492486-724fe5c67fb0', '1615874959474-d609969a20ed', '1552321554-5fefe8c9ef14'],
    locationDescription: 'South of Broad, a 6-minute walk to the Battery and 12 minutes to King Street.',
  },
  {
    title: 'Lake Placid Brick House',
    summary: 'Four-season Adirondack base with a fireside den',
    description:
      'A handsome brick house on a quiet, tree-lined street, built for big families and long weekends. Ski Whiteface in winter, paddle Mirror Lake in summer, and spend every evening in the fireside den.\n\nMain Street, the Olympic Center and the lake are a short walk away.',
    propertyType: 'House', city: 'Lake Placid', region: 'New York', country: 'United States', addressLine1: '58 Hillcrest Ave', postalCode: '12946',
    latitude: 44.2795, longitude: -73.9799, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 10, bedrooms: 5, beds: 7, bathrooms: 3, nightly: 47500, cleaning: 22500, minNights: 2,
    amenities: [...commonAmenities, 'fireplace', 'washer', 'dryer', 'tv', 'free_parking', 'game_room', 'crib', 'high_chair', 'lake_access', 'mountain_view'],
    photos: ['1449844908441-8829872d2607', '1501183638710-841dd1904471', '1617806118233-18e1de247200', '1631049307264-da0ec9d70304', '1600566752355-35792bedcfea'],
    locationDescription: 'A 7-minute walk to Main Street and Mirror Lake; Whiteface is a 20-minute drive.',
  },
  {
    title: 'Coastal Contemporary by the Beach',
    summary: 'Sleek two-level home with a pool, steps to the sand',
    description:
      'Crisp white architecture, a sparkling pool and a rooftop terrace with ocean glimpses — this contemporary home is made for easy beach days. Grab towels and chairs from the cabana and walk two blocks to the sand.\n\nIn the evening, Collins Avenue\'s restaurants and Lincoln Road are a quick ride away.',
    propertyType: 'House', city: 'Miami Beach', region: 'Florida', country: 'United States', addressLine1: '5521 Pine Tree Dr', postalCode: '33140',
    latitude: 25.8296, longitude: -80.1278, precision: LocationPrecision.APPROXIMATE,
    maxGuests: 8, bedrooms: 4, beds: 4, bathrooms: 3.5, nightly: 69500, cleaning: 30000, minNights: 3,
    amenities: [...commonAmenities, 'pool', 'beachfront', 'air_conditioning', 'free_parking', 'bbq_grill', 'outdoor_dining', 'patio', 'tv', 'washer', 'dryer', 'gym'],
    photos: ['1600596542815-ffad4c1539a9', '1512917774080-9991f1c4c750', '1600566753190-17f0baa2a6c3', '1513694203232-719a280e022f', '1540518614846-7eded433c457'],
    locationDescription: 'Mid-Beach; two blocks to the ocean and 10 minutes to South Beach.',
  },
];

const guestNames = [
  'Amelia Hart', 'Noah Bennett', 'Sofia Ramirez', 'Liam O\'Connor', 'Priya Patel', 'Ethan Brooks', 'Hannah Kim', 'Lucas Moreau',
  'Grace Liu', 'Mateo Silva', 'Chloe Martin', 'Oliver Grant', 'Zara Ahmed', 'Henry Walsh', 'Isla Novak', 'Daniel Okafor',
];
const reviewComments = [
  'Even better than the photos. Spotless, beautifully designed, and the host had thought of everything. We are already planning our next stay.',
  'A perfect weekend away. The beds were incredibly comfortable and the kitchen had everything we needed for a big family dinner.',
  'Gorgeous setting and so peaceful. Check-in was effortless and communication was quick and friendly throughout.',
  'Great location, easy to walk everywhere. The space was clean and bright. Only wish we could have stayed longer!',
  'Exactly as described. Thoughtful touches everywhere — local coffee, fresh flowers, and a great guidebook.',
  'We loved every minute. The outdoor space is the highlight; we spent every evening out there watching the sunset.',
  'Very comfortable stay. The neighborhood is quiet at night, and the home is well equipped for remote work.',
  'Stunning home with incredible views. A little tricky to find at night, but the directions in the guide were clear.',
  'Clean, cozy and well stocked. The kids loved it, and so did we. Highly recommend for families.',
  'Wonderful host and a beautiful home. It felt like a boutique hotel with all the comforts of a real house.',
];

function token() {
  return randomBytes(24).toString('base64url');
}

function code() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(8)).map((byte) => alphabet[byte % alphabet.length]).join('');
}

async function uploadPhoto(listingId: string, photoId: string, position: number) {
  const response = await fetch(`https://images.unsplash.com/photo-${photoId}?w=2400&q=82&fm=jpg`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());
  const id = randomUUID();
  const folder = `listings/${listingId}/${id}`;
  const { width, height, thumb, large } = await renderImageVariants(original);
  await Promise.all([
    storage.putObject(`${folder}/original.jpg`, original, 'image/jpeg'),
    storage.putObject(`${folder}/thumb.webp`, thumb, 'image/webp'),
    storage.putObject(`${folder}/large.webp`, large, 'image/webp'),
  ]);
  await prisma.listingMedia.create({
    data: {
      id,
      listingId,
      kind: MediaKind.IMAGE,
      status: MediaStatus.READY,
      storageKey: `${folder}/original.jpg`,
      thumbKey: `${folder}/thumb.webp`,
      largeKey: `${folder}/large.webp`,
      contentType: 'image/jpeg',
      fileName: `${photoId}.jpg`,
      sizeBytes: original.length,
      width,
      height,
      position,
    },
  });
}

async function seedDemo(adminId: string) {
  if ((await prisma.listing.count()) > 0) return;
  console.log('Seeding demo listings (downloading photos from Unsplash)...');

  const host = await prisma.user.upsert({
    where: { email: 'maya@example.com' },
    update: {},
    create: { email: 'maya@example.com', name: 'Maya Chen', role: UserRole.MANAGER, passwordHash: await argon2.hash(env('SEED_ADMIN_PASSWORD', 'ChangeMe123!')!) },
  });

  const today = todayUtc();
  let guestIndex = 0;

  for (const [index, demo] of demoListings.entries()) {
    const listing = await prisma.listing.create({
      data: {
        status: ListingStatus.PUBLISHED,
        publishedAt: addDays(new Date(), -120 + index),
        title: demo.title,
        summary: demo.summary,
        description: demo.description,
        propertyType: demo.propertyType,
        maxGuests: demo.maxGuests,
        bedrooms: demo.bedrooms,
        beds: demo.beds,
        bathrooms: demo.bathrooms,
        amenities: [...new Set(demo.amenities)],
        nightlyPrice: demo.nightly,
        cleaningFee: demo.cleaning,
        minNights: demo.minNights,
        maxNights: 60,
        houseRules: 'No parties or events.\nNo smoking inside.\nQuiet hours after 10pm.\nPlease leave the dishes clean.',
        cancellationPolicy: index % 3 === 0 ? 'STRICT' : index % 3 === 1 ? 'MODERATE' : 'FLEXIBLE',
        addressLine1: demo.addressLine1,
        city: demo.city,
        region: demo.region,
        postalCode: demo.postalCode,
        country: demo.country,
        latitude: demo.latitude,
        longitude: demo.longitude,
        locationPrecision: demo.precision,
        locationDescription: demo.locationDescription,
        timeZone: timeZoneForPoint(demo.latitude, demo.longitude),
        hostId: index % 2 === 0 ? adminId : host.id,
      },
    });

    const results = await Promise.allSettled(demo.photos.map((photo, position) => uploadPhoto(listing.id, photo, position)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    console.log(`  ${demo.title}: ${demo.photos.length - failed}/${demo.photos.length} photos`);

    // Past stays (with reviews) and upcoming stays, laid out back-to-back without overlap.
    const stays: { start: number; nights: number; review: boolean }[] = [
      { start: -80 + index, nights: Math.max(demo.minNights, 3), review: true },
      { start: -50 + index, nights: Math.max(demo.minNights, 2), review: true },
      { start: -24 + (index % 5), nights: Math.max(demo.minNights, 4), review: index % 4 !== 3 },
      { start: 6 + (index % 4) * 2, nights: Math.max(demo.minNights, 3), review: false },
      { start: 30 + index, nights: Math.max(demo.minNights, 5), review: false },
    ];
    for (const [stayIndex, stay] of stays.entries()) {
      const checkIn = addDays(today, stay.start);
      const checkOut = addDays(checkIn, stay.nights);
      const guestName = guestNames[guestIndex++ % guestNames.length];
      const guests = Math.min(demo.maxGuests, 2 + (stayIndex % 3));
      const booking = await prisma.booking.create({
        data: {
          code: code(),
          manageToken: token(),
          listingId: listing.id,
          status: BookingStatus.CONFIRMED,
          source: BookingSource.WEBSITE,
          checkIn,
          checkOut,
          nights: stay.nights,
          guests,
          guestName,
          guestEmail: `${guestName.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
          nightlyPrice: demo.nightly,
          cleaningFee: demo.cleaning,
          totalPrice: demo.nightly * stay.nights + demo.cleaning,
          currency: 'USD',
          confirmedAt: addDays(checkIn, -30),
          createdAt: addDays(checkIn, -30),
          hold: { create: { listingId: listing.id, kind: HoldKind.BOOKING, startDate: checkIn, endDate: checkOut } },
          // Demo bookings were "paid" through the development (fake) provider.
          payments: {
            create: {
              provider: 'fake',
              providerSessionId: `fake_cs_seed_${randomUUID().replace(/-/g, '')}`,
              providerPaymentId: `fake_pi_seed_${randomUUID().replace(/-/g, '')}`,
              status: PaymentStatus.SUCCEEDED,
              amount: demo.nightly * stay.nights + demo.cleaning,
              currency: 'USD',
              expiresAt: addDays(checkIn, -30),
              paidAt: addDays(checkIn, -30),
            },
          },
        },
      });
      if (stay.review) {
        const rating = (index + stayIndex) % 5 === 0 ? 4 : 5;
        const sub = (offset: number) => ((index + stayIndex + offset) % 6 === 0 ? 4 : 5);
        await prisma.review.create({
          data: {
            listingId: listing.id,
            bookingId: booking.id,
            authorName: guestName.split(' ')[0],
            rating,
            cleanliness: sub(1), accuracy: sub(2), communication: sub(3), location: sub(4), checkIn: sub(5), value: sub(0),
            comment: reviewComments[(index * 3 + stayIndex) % reviewComments.length],
            createdAt: addDays(checkOut, 2),
          },
        });
      }
    }

    // An owner block (maintenance) a couple of months out.
    await prisma.calendarHold.create({
      data: {
        listingId: listing.id,
        kind: HoldKind.BLOCK,
        startDate: addDays(today, 60 + index),
        endDate: addDays(today, 64 + index),
        note: 'Owner stay',
        createdById: adminId,
      },
    });

    const aggregate = await prisma.review.aggregate({ where: { listingId: listing.id }, _avg: { rating: true }, _count: { _all: true } });
    await prisma.listing.update({
      where: { id: listing.id },
      data: { ratingAverage: aggregate._avg.rating ? Math.round(aggregate._avg.rating * 100) / 100 : null, ratingCount: aggregate._count._all },
    });
  }
  console.log('Demo data ready.');
}

/** Version 1 of the Terms and Privacy Policy, so the pages exist on a fresh install. */
async function ensureLegalDocuments(adminId: string) {
  for (const [type, document] of [[LegalDocumentType.TERMS, defaultTerms], [LegalDocumentType.PRIVACY, defaultPrivacy]] as const) {
    if (await prisma.legalDocumentVersion.count({ where: { type } })) continue;
    await prisma.legalDocumentVersion.create({ data: { type, version: 1, title: document.title, content: document.content, changeNote: 'Initial version', createdById: adminId } });
    console.log(`Published ${document.title} v1`);
  }
}

/** Listings created before time zones existed default to UTC; derive their real zone from the map pin. */
async function backfillTimeZones() {
  const listings = await prisma.listing.findMany({ where: { timeZone: 'UTC', latitude: { not: null }, longitude: { not: null } }, select: { id: true, latitude: true, longitude: true } });
  for (const listing of listings) {
    const timeZone = timeZoneForPoint(listing.latitude!, listing.longitude!);
    if (timeZone !== 'UTC') await prisma.listing.update({ where: { id: listing.id }, data: { timeZone } });
  }
  if (listings.length) console.log(`Backfilled time zones for ${listings.length} listing(s)`);
}

async function main() {
  const admin = await ensureAdmin();
  await ensureLegalDocuments(admin.id);
  await backfillTimeZones();
  if (env('SEED_DEMO_DATA', 'false') === 'true') await seedDemo(admin.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
