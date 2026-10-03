import { BadRequestException, Controller, Get, Injectable, Logger, Module, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from '../common/rate-limit.service';
import { clientIp, type AppRequest } from '../common/request';
import { timeZoneForPoint } from '../common/timezone';

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
    extent?: [number, number, number, number];
  };
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
  bounds: { north: number; south: number; east: number; west: number } | null;
};

/**
 * Free OSM-based geocoding through Photon (komoot). Proxied so the provider can be swapped or
 * self-hosted without touching the web app, and so calls are rate limited across replicas.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(private readonly config: ConfigService) {}

  async search(q: string, limit = 6): Promise<Place[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const base = this.config.get<string>('GEOCODER_URL', 'https://photon.komoot.io/api');
    const url = `${base}?q=${encodeURIComponent(term)}&limit=${limit}&lang=en`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': this.config.get<string>('GEOCODER_USER_AGENT', 'bookingplatform/0.1'), Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      this.logger.warn(`Geocoder unreachable: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Location search is temporarily unavailable.');
    }
    if (!response.ok) throw new ServiceUnavailableException('Location search is temporarily unavailable.');
    const body = (await response.json()) as { features?: PhotonFeature[] };
    return (body.features ?? []).map((feature) => this.toPlace(feature));
  }

  private toPlace(feature: PhotonFeature): Place {
    const p = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    // When the result *is* a settlement, Photon puts its name in `name` rather than `city`.
    const isSettlement = ['city', 'town', 'village', 'hamlet', 'municipality'].includes(p.osm_value ?? p.type ?? '');
    const city = (isSettlement ? p.name : p.city) ?? p.district ?? p.county ?? '';
    const isAddress = Boolean(p.street);
    const name = isAddress ? street : (p.name ?? city);
    const label = [name, city !== name ? city : '', p.state, p.country].filter(Boolean).join(', ');
    // Photon extents are [minLon, maxLat, maxLon, minLat]; normalize defensively.
    const bounds = p.extent
      ? {
          west: Math.min(p.extent[0], p.extent[2]),
          east: Math.max(p.extent[0], p.extent[2]),
          south: Math.min(p.extent[1], p.extent[3]),
          north: Math.max(p.extent[1], p.extent[3]),
        }
      : null;
    return {
      label,
      name: name ?? '',
      street,
      city,
      region: p.state ?? '',
      postalCode: p.postcode ?? '',
      country: p.country ?? '',
      latitude,
      longitude,
      type: p.osm_value ?? p.type ?? '',
      bounds,
    };
  }
}

@Controller('geo')
export class GeoController {
  constructor(
    private readonly geo: GeoService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('search')
  async search(@Query('q') q = '', @Req() request: AppRequest) {
    await this.rateLimit.consume(`geo:ip:${clientIp(request)}`, 60, 60);
    return this.geo.search(String(q).slice(0, 200));
  }

  /** IANA time zone for a coordinate (offline lookup), used by the listing editor as the pin moves. */
  @Get('timezone')
  timeZone(@Query('lat') lat: string, @Query('lng') lng: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new BadRequestException('Provide valid lat and lng.');
    }
    return { timeZone: timeZoneForPoint(latitude, longitude) };
  }
}

@Module({
  controllers: [GeoController],
  providers: [GeoService],
})
export class GeoModule {}
