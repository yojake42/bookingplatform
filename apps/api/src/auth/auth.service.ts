import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../common/rate-limit.service';
import type { AuthenticatedUser } from '../common/request';

const loginWindowSeconds = 15 * 60;
const sessionTouchIntervalMs = 5 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
  ) {}

  get sessionTtlMs() {
    return Number(this.config.get<string>('SESSION_TTL_HOURS', '336')) * 60 * 60 * 1000;
  }

  async login(email: string, password: string, context: { ip: string; userAgent?: string }) {
    const normalizedEmail = email.trim().toLowerCase();
    const message = 'Too many sign-in attempts. Please wait a few minutes and try again.';
    await this.rateLimit.consume(`login:ip:${context.ip}`, 50, loginWindowSeconds, message);
    await this.rateLimit.consume(`login:email:${normalizedEmail}`, 10, loginWindowSeconds, message);

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Always run a hash verification so response time does not reveal whether the account exists.
    const passwordOk = user
      ? await argon2.verify(user.passwordHash, password)
      : await argon2.verify(await this.dummyHash(), password).then(() => false);
    if (!user || !user.isActive || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.rateLimit.reset(`login:email:${normalizedEmail}`);
    const token = await this.createSession(user.id, context);
    return { token, user: this.toAuthenticatedUser(user) };
  }

  async createSession(userId: string, context: { ip?: string; userAgent?: string } = {}) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + this.sessionTtlMs),
        ipAddress: context.ip?.slice(0, 100),
        userAgent: context.userAgent?.slice(0, 500),
      },
    });
    return token;
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() < Date.now() || !session.user.isActive) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
    if (Date.now() - session.lastSeenAt.getTime() > sessionTouchIntervalMs) {
      // Sliding expiry; written at most every few minutes to keep reads cheap.
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + this.sessionTtlMs) },
      });
    }
    return this.toAuthenticatedUser(session.user);
  }

  async logout(token: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async changePassword(userId: string, currentToken: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('Choose a password that is different from your current one.');
    }
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Sign out every other device; the current session stays valid.
      this.prisma.session.deleteMany({ where: { userId, tokenHash: { not: hashToken(currentToken) } } }),
    ]);
  }

  /** CSRF token bound to the session: the SPA echoes it in a header on every unsafe request. */
  csrfToken(sessionToken: string) {
    return createHash('sha256').update(`csrf:${sessionToken}`).digest('base64url');
  }

  verifyCsrf(sessionToken: string, provided: string | undefined) {
    if (!provided) return false;
    const expected = Buffer.from(this.csrfToken(sessionToken));
    const actual = Buffer.from(provided);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private cachedDummyHash?: Promise<string>;
  private dummyHash() {
    this.cachedDummyHash ??= argon2.hash(randomBytes(16).toString('hex'));
    return this.cachedDummyHash;
  }

  private toAuthenticatedUser(user: { id: string; email: string; name: string; role: AuthenticatedUser['role'] }): AuthenticatedUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
