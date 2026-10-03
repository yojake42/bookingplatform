import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { LegalDocumentType, type LegalDocumentVersion } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminOnly, SessionGuard } from '../auth/session.guard';
import { isUniqueViolation } from '../common/db-errors';
import { CurrentUser, type AuthenticatedUser } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class PublishLegalDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsString() @MinLength(20, { message: 'The document needs some content.' }) @MaxLength(200_000) content: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) changeNote?: string;
}

const slugs: Record<string, LegalDocumentType> = { terms: LegalDocumentType.TERMS, privacy: LegalDocumentType.PRIVACY };

function typeFromSlug(slug: string) {
  const type = slugs[slug];
  if (!type) throw new NotFoundException();
  return type;
}

/**
 * Versioned legal documents. Versions are append-only: publishing creates version N+1, in force from
 * its publishedAt until the next version's publishedAt. Bookings record the versions the guest accepted.
 */
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async current(type: LegalDocumentType) {
    return this.prisma.legalDocumentVersion.findFirst({ where: { type, publishedAt: { lte: new Date() } }, orderBy: { version: 'desc' } });
  }

  async currentIds() {
    const [terms, privacy] = await Promise.all([this.current(LegalDocumentType.TERMS), this.current(LegalDocumentType.PRIVACY)]);
    return { termsVersionId: terms?.id ?? null, privacyVersionId: privacy?.id ?? null };
  }

  /** Every version with the period it was in force. */
  async history(type: LegalDocumentType) {
    const versions = await this.prisma.legalDocumentVersion.findMany({
      where: { type },
      orderBy: { version: 'desc' },
      include: { createdBy: { select: { name: true } }, _count: { select: { termsBookings: true, privacyBookings: true } } },
    });
    return versions.map((version, index) => ({
      id: version.id,
      version: version.version,
      title: version.title,
      changeNote: version.changeNote,
      effectiveFrom: version.publishedAt,
      // Versions are sorted newest first, so the newer neighbour ended this one's period.
      effectiveTo: index === 0 ? null : versions[index - 1].publishedAt,
      isCurrent: index === 0,
      publishedBy: version.createdBy?.name ?? null,
      acceptedByBookings: version._count.termsBookings + version._count.privacyBookings,
    }));
  }

  async version(type: LegalDocumentType, version: number) {
    const found = await this.prisma.legalDocumentVersion.findUnique({ where: { type_version: { type, version } } });
    if (!found) throw new NotFoundException('That version does not exist.');
    return found;
  }

  async publish(type: LegalDocumentType, input: PublishLegalDto, userId: string | null): Promise<LegalDocumentVersion> {
    // Version numbers come from max+1; the unique (type, version) index settles races between replicas.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await this.prisma.legalDocumentVersion.aggregate({ where: { type }, _max: { version: true } });
      try {
        return await this.prisma.legalDocumentVersion.create({
          data: { type, version: (latest._max.version ?? 0) + 1, title: input.title, content: input.content, changeNote: input.changeNote ?? '', createdById: userId },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Could not allocate a version number. Please try again.');
  }

  publicView(document: LegalDocumentVersion) {
    return { type: document.type, version: document.version, title: document.title, content: document.content, publishedAt: document.publishedAt };
  }
}

@Controller('public/legal')
class PublicLegalController {
  constructor(private readonly legal: LegalService) {}

  @Get(':type')
  async current(@Param('type') slug: string) {
    const type = typeFromSlug(slug);
    const [document, history] = await Promise.all([this.legal.current(type), this.legal.history(type)]);
    if (!document) throw new NotFoundException('This page has not been published yet.');
    return {
      ...this.legal.publicView(document),
      versions: history.map(({ version, effectiveFrom, effectiveTo, changeNote }) => ({ version, effectiveFrom, effectiveTo, changeNote })),
    };
  }

  @Get(':type/versions/:version')
  async version(@Param('type') slug: string, @Param('version', ParseIntPipe) version: number) {
    return this.legal.publicView(await this.legal.version(typeFromSlug(slug), version));
  }
}

@Controller('admin/legal')
@UseGuards(SessionGuard)
@AdminOnly()
class AdminLegalController {
  constructor(private readonly legal: LegalService) {}

  @Get(':type')
  async overview(@Param('type') slug: string) {
    const type = typeFromSlug(slug);
    const [current, history] = await Promise.all([this.legal.current(type), this.legal.history(type)]);
    return { current, history };
  }

  @Get(':type/versions/:version')
  version(@Param('type') slug: string, @Param('version', ParseIntPipe) version: number) {
    return this.legal.version(typeFromSlug(slug), version);
  }

  @Post(':type')
  publish(@Param('type') slug: string, @Body() dto: PublishLegalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.legal.publish(typeFromSlug(slug), dto, user.id);
  }
}

@Module({
  controllers: [PublicLegalController, AdminLegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
