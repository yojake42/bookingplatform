import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MediaStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Arbitrary constant identifying this job's advisory lock. */
const maintenanceLockId = 4_120_001;

/**
 * Hourly housekeeping. Every replica schedules it, but a transaction-scoped Postgres advisory lock
 * lets exactly one replica run it per tick; the others skip immediately.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    const staleUploads = await this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${maintenanceLockId}::bigint) AS locked`;
        if (!locked) return null;

        const now = new Date();
        await tx.session.deleteMany({ where: { expiresAt: { lt: now } } });
        await tx.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
        // Uploads that were started but never completed (tab closed, network dropped).
        const stale = await tx.listingMedia.findMany({
          where: { status: MediaStatus.PENDING, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
          select: { id: true, storageKey: true },
        });
        await tx.listingMedia.deleteMany({ where: { id: { in: stale.map((media) => media.id) } } });
        return stale;
      },
      { timeout: 30_000 },
    );

    if (staleUploads?.length) {
      await this.storage.deleteObjects(staleUploads.map((media) => media.storageKey));
      this.logger.log(`Removed ${staleUploads.length} abandoned upload(s).`);
    }
  }
}

@Module({ providers: [MaintenanceService] })
export class MaintenanceModule {}
