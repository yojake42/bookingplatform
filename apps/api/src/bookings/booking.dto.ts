import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBookingDto {
  @IsUUID() listingId: string;
  @IsString() checkIn: string;
  @IsString() checkOut: string;
  @IsInt() @Min(1) @Max(50) guests: number;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) guestName: string;
  @Transform(trim) @IsEmail() @MaxLength(254) guestEmail: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) guestPhone?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  /** Generated once per checkout attempt so retries and double-clicks never create two bookings. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey?: string;
  /** Guest accepted the current Terms of Service and Privacy Policy (required for website bookings). */
  @IsOptional() @IsBoolean() acceptTerms?: boolean;
}

export class StaffCreateBookingDto extends CreateBookingDto {}

export class CancelBookingDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class StaffCancelDto extends CancelBookingDto {
  /** policy: what the cancellation policy allows; full/none; custom: `refundAmount` (minor units). */
  @IsOptional() @IsIn(['policy', 'full', 'none', 'custom']) refund?: 'policy' | 'full' | 'none' | 'custom';
  @IsOptional() @IsInt() @Min(0) refundAmount?: number;
}

export class IssueRefundDto {
  @IsInt() @Min(1) amount: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class TripLookupDto {
  @Transform(trim) @IsString() @MinLength(4) @MaxLength(20) code: string;
  @Transform(trim) @IsEmail() email: string;
}

export class TripLinksDto {
  @Transform(trim) @IsEmail() @MaxLength(254) email: string;
}

export class CreateBlockDto {
  @IsString() startDate: string;
  /** Exclusive: the first date that is available again. */
  @IsString() endDate: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class CalendarQuery {
  @IsString() from: string;
  @IsString() to: string;
}

export class AdminBookingsQuery {
  @IsOptional() @IsIn(['upcoming', 'current', 'past', 'cancelled', 'pending', 'all']) view?: string;
  @IsOptional() @IsUUID() listingId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}
