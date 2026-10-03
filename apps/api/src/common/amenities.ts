/**
 * Amenity keys accepted on listings. Labels, icons and grouping live in the web app
 * (apps/web/src/lib/amenities.ts); keep the two lists in sync.
 */
export const amenityKeys = [
  // Essentials
  'wifi', 'kitchen', 'washer', 'dryer', 'air_conditioning', 'heating', 'workspace', 'tv', 'hair_dryer', 'iron', 'essentials',
  // Features
  'pool', 'hot_tub', 'free_parking', 'ev_charger', 'gym', 'bbq_grill', 'fireplace', 'patio', 'outdoor_dining', 'fire_pit',
  'piano', 'game_room', 'sauna',
  // Location
  'beachfront', 'waterfront', 'lake_access', 'ski_in_out', 'mountain_view', 'ocean_view',
  // Family & pets
  'crib', 'high_chair', 'pets_allowed',
  // Safety
  'smoke_alarm', 'carbon_monoxide_alarm', 'first_aid_kit', 'fire_extinguisher',
  // Services
  'self_check_in', 'long_term_stays', 'luggage_dropoff',
] as const;

export type AmenityKey = (typeof amenityKeys)[number];

export const propertyTypes = [
  'House', 'Apartment', 'Condo', 'Cabin', 'Cottage', 'Villa', 'Townhouse', 'Loft', 'Chalet', 'Bungalow', 'Guesthouse', 'Other',
] as const;
