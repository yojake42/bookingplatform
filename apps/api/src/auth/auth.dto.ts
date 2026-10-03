import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const passwordMinLength = 10;

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(passwordMinLength, { message: `New password must be at least ${passwordMinLength} characters.` })
  @MaxLength(200)
  newPassword: string;
}
