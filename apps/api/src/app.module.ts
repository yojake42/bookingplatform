import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { hostname } from 'os';
import { AuthModule } from './auth/auth.module';
import { AdminBookingsController, PublicBookingsController } from './bookings/bookings.controllers';
import { AvailabilityService } from './bookings/availability.service';
import { BookingsService } from './bookings/bookings.service';
import { RateLimitModule } from './common/rate-limit.service';
import { GeoModule } from './geo/geo';
import { AdminListingsController, PublicListingsController } from './listings/listings.controllers';
import { ListingsService } from './listings/listings.service';
import { MaintenanceModule } from './maintenance/maintenance.service';
import { MediaController } from './media/media.controller';
import { MediaService } from './media/media.service';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { AdminReviewsController, PublicReviewsController } from './reviews/reviews.controllers';
import { ReviewsService } from './reviews/reviews.service';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users';
import { EmailModule } from './email/email.module';
import { PaymentsModule } from './payments/payments.module';
import { LegalModule } from './legal/legal';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    // `instance` makes it easy to see requests spreading across replicas.
    return { status: 'ok', instance: hostname() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RateLimitModule,
    StorageModule,
    AuthModule,
    EmailModule,
    PaymentsModule,
    LegalModule,
    UsersModule,
    GeoModule,
    MaintenanceModule,
  ],
  controllers: [
    HealthController,
    PublicListingsController,
    AdminListingsController,
    MediaController,
    PublicBookingsController,
    AdminBookingsController,
    PublicReviewsController,
    AdminReviewsController,
  ],
  providers: [ListingsService, MediaService, AvailabilityService, BookingsService, ReviewsService],
})
export class AppModule {}
