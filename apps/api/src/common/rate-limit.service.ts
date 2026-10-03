import { Global, HttpException, HttpStatus, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fixed-window rate limiting stored in Postgres, so limits are shared across every API replica.
 * The upsert is a single atomic statement; concurrent hits on the same key serialize on the row.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records a hit and returns whether the caller is still within `limit` for the window. */
  async hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" < now() - (${windowSeconds}::int * interval '1 second') THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" < now() - (${windowSeconds}::int * interval '1 second') THEN now()
          ELSE "RateLimit"."windowStart"
        END
      RETURNING "count"`;
    return (rows[0]?.count ?? 0) <= limit;
  }

  async consume(key: string, limit: number, windowSeconds: number, message = 'Too many requests. Please try again shortly.') {
    if (!(await this.hit(key, limit, windowSeconds))) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async reset(key: string) {
    await this.prisma.rateLimit.deleteMany({ where: { key } });
  }
}

@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
