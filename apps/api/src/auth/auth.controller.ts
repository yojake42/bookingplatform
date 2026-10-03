import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { SessionGuard } from './session.guard';
import { clientIp, CurrentUser, type AppRequest, type AuthenticatedUser } from '../common/request';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get cookieName() {
    return this.config.get<string>('SESSION_COOKIE_NAME', 'bp_session');
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('COOKIE_SECURE', 'false') === 'true',
      path: '/',
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    const { token, user } = await this.auth.login(dto.email, dto.password, {
      ip: clientIp(request),
      userAgent: request.headers['user-agent'],
    });
    response.cookie(this.cookieName, token, { ...this.cookieOptions(), maxAge: this.auth.sessionTtlMs });
    return { user, csrfToken: this.auth.csrfToken(token) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[this.cookieName] as string | undefined;
    if (token) await this.auth.logout(token);
    response.clearCookie(this.cookieName, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: AuthenticatedUser, @Req() request: AppRequest) {
    return { user, csrfToken: this.auth.csrfToken(request.sessionToken!) };
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Req() request: AppRequest, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, request.sessionToken!, dto.currentPassword, dto.newPassword);
  }
}
