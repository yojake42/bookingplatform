import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import type { AppRequest } from '../common/request';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const adminOnlyKey = 'adminOnly';

/** Restricts a route or controller to ADMIN users (staff management). */
export const AdminOnly = () => SetMetadata(adminOnlyKey, true);

/** Requires a valid staff session; unsafe methods must also carry the session's CSRF token. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const cookieName = this.config.get<string>('SESSION_COOKIE_NAME', 'bp_session');
    const token = request.cookies?.[cookieName] as string | undefined;
    if (!token) throw new UnauthorizedException('Please sign in to continue.');

    request.user = await this.auth.authenticate(token);
    request.sessionToken = token;

    if (unsafeMethods.has(request.method.toUpperCase())) {
      const header = request.headers['x-csrf-token'];
      if (!this.auth.verifyCsrf(token, Array.isArray(header) ? header[0] : header)) {
        throw new ForbiddenException('Your session token is out of date. Refresh the page and try again.');
      }
    }

    const adminOnly = this.reflector.getAllAndOverride<boolean>(adminOnlyKey, [context.getHandler(), context.getClass()]);
    if (adminOnly && request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can do that.');
    }
    return true;
  }
}
