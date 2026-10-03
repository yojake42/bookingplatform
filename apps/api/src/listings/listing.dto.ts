import { CancellationPolicy, ListingStatus, LocationPrecision } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isValidTimeZone } from '../common/timezone';
import { amenityKeys, propertyTypes } from '../common/amenities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

@ValidatorConstraint({ name: 'timeZone' })
class IsTimeZone implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidTimeZone(value);
  }
  defaultMessage() {
    return 'Time zone must be a valid IANA zone, e.g. America/Denver.';
  }
}

/** Every field is optional so the editor can PATCH whichever section changed. */
export class UpdateListingDto {
  @IsOptional() @IsEnum(ListingStatus) status?: ListingStatus;

  @IsOptional() @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) title?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) summary?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsIn(propertyTypes as unknown as string[]) propertyType?: string;

  @IsOptional() @IsInt() @Min(1) @Max(50) maxGuests?: number;
  @IsOptional() @IsInt() @Min(0) @Max(50) bedrooms?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) beds?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(50) bathrooms?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(amenityKeys.length)
  @IsIn(amenityKeys as unknown as string[], { each: true })
  amenities?: string[];

  @IsOptional() @IsInt() @Min(0) @Max(100_000_00) nightlyPrice?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_00) cleaningFee?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) minNights?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) maxNights?: number;
  @IsOptional() @Matches(timePattern, { message: 'Check-in time must be HH:MM.' }) checkInTime?: string;
  @IsOptional() @Matches(timePattern, { message: 'Check-out time must be HH:MM.' }) checkOutTime?: string;
  @IsOptional() @IsString() @MaxLength(5000) houseRules?: string;
  @IsOptional() @IsEnum(CancellationPolicy) cancellationPolicy?: CancellationPolicy;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) addressLine1?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) addressLine2?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) city?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) region?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) postalCode?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) country?: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsLatitude() latitude?: number | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsLongitude() longitude?: number | null;
  @IsOptional() @IsEnum(LocationPrecision) locationPrecision?: LocationPrecision;
  @IsOptional() @IsString() @MaxLength(5000) locationDescription?: string;
  /** IANA zone. Detected from the map pin when coordinates change, unless provided explicitly. */
  @IsOptional() @Validate(IsTimeZone) timeZone?: string;

  @IsOptional() @IsString() hostId?: string;
}

export class CreateListingDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) title: string;
}

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((part) => part.trim()).filter(Boolean) : value;

export class SearchListingsQuery {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) guests?: number;
  @IsOptional() @IsString() checkIn?: string;
  @IsOptional() @IsString() checkOut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) beds?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) bathrooms?: number;
  @IsOptional() @Transform(csv) @IsArray() @IsString({ each: true }) types?: string[];
  @IsOptional() @Transform(csv) @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @Type(() => Number) @IsLatitude() north?: number;
  @IsOptional() @Type(() => Number) @IsLatitude() south?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() east?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() west?: number;
  @IsOptional() @IsIn(['recommended', 'price_asc', 'price_desc', 'rating', 'newest']) sort?: string;
}

export class AvailabilityQuery {
  @IsString() from: string;
  @IsString() to: string;
}

export class QuoteQuery {
  @IsString() checkIn: string;
  @IsString() checkOut: string;
  @Type(() => Number) @IsInt() @Min(1) guests: number;
}
