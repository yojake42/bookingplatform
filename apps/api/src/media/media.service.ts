import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MediaKind, MediaStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { mediaDto } from '../listings/listing.mapper';

export const maxMediaPerListing = 60;

const imageTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
const videoTypes: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};
export const maxImageBytes = 30 * 1024 * 1024;
export const maxVideoBytes = 1024 * 1024 * 1024;

/** Display variants generated for every image; originals are kept untouched. */
const variants = {
  thumb: { size: 720, quality: 76 },
  large: { size: 2048, quality: 82 },
} as const;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Step 1: reserve a media row and hand the browser a presigned PUT URL for the original. */
  async createUpload(listingId: string, input: { fileName: string; contentType: string; sizeBytes: number }) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } });
    if (!listing) throw new NotFoundException('Listing not found.');

    const contentType = input.contentType.toLowerCase();
    const isImage = contentType in imageTypes;
    const isVideo = contentType in videoTypes;
    if (!isImage && !isVideo) {
      throw new BadRequestException(`${input.fileName}: use JPEG, PNG, WebP or AVIF photos, or MP4, WebM or MOV videos.`);
    }
    const limit = isImage ? maxImageBytes : maxVideoBytes;
    if (input.sizeBytes > limit) {
      throw new BadRequestException(`${input.fileName} is larger than the ${Math.round(limit / 1024 / 1024)} MB limit.`);
    }

    const count = await this.prisma.listingMedia.count({ where: { listingId } });
    if (count >= maxMediaPerListing) {
      throw new BadRequestException(`A listing can have at most ${maxMediaPerListing} photos and videos.`);
    }

    const id = randomUUID();
    const extension = isImage ? imageTypes[contentType] : videoTypes[contentType];
    const storageKey = `listings/${listingId}/${id}/original.${extension}`;
    const last = await this.prisma.listingMedia.aggregate({ where: { listingId }, _max: { position: true } });

    const media = await this.prisma.listingMedia.create({
      data: {
        id,
        listingId,
        kind: isImage ? MediaKind.IMAGE : MediaKind.VIDEO,
        status: MediaStatus.PENDING,
        storageKey,
        contentType,
        fileName: input.fileName.slice(0, 255),
        sizeBytes: input.sizeBytes,
        position: (last._max.position ?? -1) + 1,
      },
    });

    return {
      media: mediaDto(this.storage, media),
      upload: {
        url: await this.storage.presignUpload(storageKey, contentType),
        method: 'PUT',
        headers: { 'Content-Type': contentType },
      },
    };
  }

  /** Step 2: after the browser finishes the PUT, verify the object and build display variants. */
  async completeUpload(mediaId: string) {
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Upload not found.');
    if (media.status === MediaStatus.READY) return mediaDto(this.storage, media);

    const head = await this.storage.headObject(media.storageKey);
    if (!head) throw new BadRequestException('The file never reached storage. Please try the upload again.');
    const limit = media.kind === MediaKind.IMAGE ? maxImageBytes : maxVideoBytes;
    if (head.size > limit) {
      await this.discard(media);
      throw new BadRequestException(`${media.fileName} is larger than the allowed size.`);
    }

    let update: { width?: number; height?: number; thumbKey?: string; largeKey?: string } = {};
    if (media.kind === MediaKind.IMAGE) {
      try {
        update = await this.buildImageVariants(media.storageKey);
      } catch (error) {
        this.logger.warn(`Could not process ${media.storageKey}: ${(error as Error).message}`);
        await this.discard(media);
        throw new BadRequestException(`${media.fileName} could not be read as an image.`);
      }
    }

    const ready = await this.prisma.listingMedia.update({
      where: { id: mediaId },
      data: { ...update, status: MediaStatus.READY, sizeBytes: head.size },
    });
    return mediaDto(this.storage, ready);
  }

  async reorder(listingId: string, mediaIds: string[]) {
    const existing = await this.prisma.listingMedia.findMany({ where: { listingId }, select: { id: true } });
    const known = new Set(existing.map((item) => item.id));
    if (mediaIds.length !== known.size || mediaIds.some((id) => !known.has(id)) || new Set(mediaIds).size !== mediaIds.length) {
      throw new BadRequestException('The media list changed while you were reordering. Refresh and try again.');
    }
    await this.prisma.$transaction(
      mediaIds.map((id, position) => this.prisma.listingMedia.update({ where: { id }, data: { position } })),
    );
    return this.listForListing(listingId);
  }

  async updateCaption(mediaId: string, caption: string) {
    const media = await this.prisma.listingMedia.update({ where: { id: mediaId }, data: { caption } }).catch(() => null);
    if (!media) throw new NotFoundException('Media not found.');
    return mediaDto(this.storage, media);
  }

  async remove(mediaId: string) {
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!media) return;
    await this.discard(media);
  }

  async listForListing(listingId: string) {
    const media = await this.prisma.listingMedia.findMany({
      where: { listingId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return media.map((item) => mediaDto(this.storage, item));
  }

  /** Removes the row first so nothing references the objects, then deletes the objects best-effort. */
  async discard(media: { id: string; storageKey: string; thumbKey: string | null; largeKey: string | null }) {
    await this.prisma.listingMedia.deleteMany({ where: { id: media.id } });
    await this.storage.deleteObjects([media.storageKey, media.thumbKey ?? '', media.largeKey ?? '']);
  }

  private async buildImageVariants(storageKey: string) {
    const original = await this.storage.getObjectBuffer(storageKey);
    const { width, height, thumb, large } = await renderImageVariants(original);
    const folder = storageKey.slice(0, storageKey.lastIndexOf('/'));
    const keys = { thumbKey: `${folder}/thumb.webp`, largeKey: `${folder}/large.webp` };
    await Promise.all([
      this.storage.putObject(keys.thumbKey, thumb, 'image/webp'),
      this.storage.putObject(keys.largeKey, large, 'image/webp'),
    ]);
    return { width, height, ...keys };
  }
}

/** Builds the WebP display variants for an uploaded image. Originals are kept untouched. */
export async function renderImageVariants(original: Buffer) {
  // `rotate()` with no angle applies EXIF orientation, so phone photos come out upright.
  const base = sharp(original, { failOn: 'error' }).rotate();
  const metadata = await base.metadata();
  const swap = (metadata.orientation ?? 1) >= 5;
  const render = (size: number, quality: number) =>
    base.clone().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
  const [thumb, large] = await Promise.all([
    render(variants.thumb.size, variants.thumb.quality),
    render(variants.large.size, variants.large.quality),
  ]);
  return {
    width: swap ? metadata.height : metadata.width,
    height: swap ? metadata.width : metadata.height,
    thumb,
    large,
  };
}
