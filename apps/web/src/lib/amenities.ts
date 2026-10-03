import {
  AirVent, Baby, Bath, BedDouble, Briefcase, Car, CookingPot, Dog, Dumbbell, Fan, Flame, FlameKindling,
  Gamepad2, Heater, KeyRound, Luggage, Mountain, Music, PlugZap, ShieldAlert, ShieldPlus, Shirt, Siren, Snowflake,
  Sun, Tv, Umbrella, UtensilsCrossed, Waves, WashingMachine, Wifi, Wind, Calendar, Droplets, Ship, Thermometer, type LucideIcon,
} from 'lucide-react';

/** Keep keys in sync with apps/api/src/common/amenities.ts. */
export type Amenity = { key: string; label: string; icon: LucideIcon; group: string };

export const amenities: Amenity[] = [
  { key: 'wifi', label: 'Wifi', icon: Wifi, group: 'Essentials' },
  { key: 'kitchen', label: 'Kitchen', icon: CookingPot, group: 'Essentials' },
  { key: 'washer', label: 'Washer', icon: WashingMachine, group: 'Essentials' },
  { key: 'dryer', label: 'Dryer', icon: Wind, group: 'Essentials' },
  { key: 'air_conditioning', label: 'Air conditioning', icon: AirVent, group: 'Essentials' },
  { key: 'heating', label: 'Heating', icon: Heater, group: 'Essentials' },
  { key: 'workspace', label: 'Dedicated workspace', icon: Briefcase, group: 'Essentials' },
  { key: 'tv', label: 'TV', icon: Tv, group: 'Essentials' },
  { key: 'hair_dryer', label: 'Hair dryer', icon: Fan, group: 'Essentials' },
  { key: 'iron', label: 'Iron', icon: Shirt, group: 'Essentials' },
  { key: 'essentials', label: 'Towels, sheets & soap', icon: BedDouble, group: 'Essentials' },

  { key: 'pool', label: 'Pool', icon: Waves, group: 'Features' },
  { key: 'hot_tub', label: 'Hot tub', icon: Bath, group: 'Features' },
  { key: 'free_parking', label: 'Free parking', icon: Car, group: 'Features' },
  { key: 'ev_charger', label: 'EV charger', icon: PlugZap, group: 'Features' },
  { key: 'gym', label: 'Gym', icon: Dumbbell, group: 'Features' },
  { key: 'bbq_grill', label: 'BBQ grill', icon: Flame, group: 'Features' },
  { key: 'fireplace', label: 'Indoor fireplace', icon: FlameKindling, group: 'Features' },
  { key: 'patio', label: 'Patio or balcony', icon: Sun, group: 'Features' },
  { key: 'outdoor_dining', label: 'Outdoor dining area', icon: UtensilsCrossed, group: 'Features' },
  { key: 'fire_pit', label: 'Fire pit', icon: Flame, group: 'Features' },
  { key: 'piano', label: 'Piano', icon: Music, group: 'Features' },
  { key: 'game_room', label: 'Game room', icon: Gamepad2, group: 'Features' },
  { key: 'sauna', label: 'Sauna', icon: Thermometer, group: 'Features' },

  { key: 'beachfront', label: 'Beach access', icon: Umbrella, group: 'Location' },
  { key: 'waterfront', label: 'Waterfront', icon: Droplets, group: 'Location' },
  { key: 'lake_access', label: 'Lake access', icon: Ship, group: 'Location' },
  { key: 'ski_in_out', label: 'Ski-in/ski-out', icon: Snowflake, group: 'Location' },
  { key: 'mountain_view', label: 'Mountain view', icon: Mountain, group: 'Location' },
  { key: 'ocean_view', label: 'Ocean view', icon: Waves, group: 'Location' },

  { key: 'crib', label: 'Crib', icon: Baby, group: 'Family & pets' },
  { key: 'high_chair', label: 'High chair', icon: Baby, group: 'Family & pets' },
  { key: 'pets_allowed', label: 'Pets allowed', icon: Dog, group: 'Family & pets' },

  { key: 'smoke_alarm', label: 'Smoke alarm', icon: ShieldAlert, group: 'Safety' },
  { key: 'carbon_monoxide_alarm', label: 'Carbon monoxide alarm', icon: Siren, group: 'Safety' },
  { key: 'first_aid_kit', label: 'First aid kit', icon: ShieldPlus, group: 'Safety' },
  { key: 'fire_extinguisher', label: 'Fire extinguisher', icon: Flame, group: 'Safety' },

  { key: 'self_check_in', label: 'Self check-in', icon: KeyRound, group: 'Services' },
  { key: 'long_term_stays', label: 'Long-term stays allowed', icon: Calendar, group: 'Services' },
  { key: 'luggage_dropoff', label: 'Luggage drop-off', icon: Luggage, group: 'Services' },
];

export const amenityByKey = new Map(amenities.map((amenity) => [amenity.key, amenity]));
export const amenityGroups = [...new Set(amenities.map((amenity) => amenity.group))];

/** Amenities worth surfacing as quick filters on the search page. */
export const popularAmenityKeys = ['wifi', 'kitchen', 'pool', 'hot_tub', 'free_parking', 'air_conditioning', 'workspace', 'pets_allowed', 'fireplace', 'washer'];

export const propertyTypes = ['House', 'Apartment', 'Condo', 'Cabin', 'Cottage', 'Villa', 'Townhouse', 'Loft', 'Chalet', 'Bungalow', 'Guesthouse', 'Other'];

