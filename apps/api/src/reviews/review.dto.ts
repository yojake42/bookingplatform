import { IsBoolean, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsInt() @Min(1) @Max(5) cleanliness: number;
  @IsInt() @Min(1) @Max(5) accuracy: number;
  @IsInt() @Min(1) @Max(5) communication: number;
  @IsInt() @Min(1) @Max(5) location: number;
  @IsInt() @Min(1) @Max(5) checkIn: number;
  @IsInt() @Min(1) @Max(5) value: number;
  @IsString() @MinLength(10, { message: 'Tell future guests a little more (at least 10 characters).' }) @MaxLength(3000) comment: string;
}

export class ModerateReviewDto {
  @IsBoolean() isHidden: boolean;
}
