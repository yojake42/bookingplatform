import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { SessionGuard } from '../auth/session.guard';
import { MediaService, maxMediaPerListing } from './media.service';

class CreateUploadDto {
  @IsString() @MinLength(1) @MaxLength(255) fileName: string;
  @IsString() @MaxLength(100) contentType: string;
  @IsInt() @Min(1) sizeBytes: number;
}

class ReorderDto {
  @IsArray() @ArrayMaxSize(maxMediaPerListing) @IsUUID('4', { each: true }) mediaIds: string[];
}

class CaptionDto {
  @IsString() @MaxLength(300) caption: string;
}

@Controller('admin')
@UseGuards(SessionGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('listings/:listingId/media')
  list(@Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.media.listForListing(listingId);
  }

  @Post('listings/:listingId/media/uploads')
  createUpload(@Param('listingId', ParseUUIDPipe) listingId: string, @Body() dto: CreateUploadDto) {
    return this.media.createUpload(listingId, dto);
  }

  @Patch('listings/:listingId/media/order')
  reorder(@Param('listingId', ParseUUIDPipe) listingId: string, @Body() dto: ReorderDto) {
    return this.media.reorder(listingId, dto.mediaIds);
  }

  @Post('media/:mediaId/complete')
  @HttpCode(200)
  complete(@Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.completeUpload(mediaId);
  }

  @Patch('media/:mediaId')
  caption(@Param('mediaId', ParseUUIDPipe) mediaId: string, @Body() dto: CaptionDto) {
    return this.media.updateCaption(mediaId, dto.caption.trim());
  }

  @Delete('media/:mediaId')
  @HttpCode(204)
  async remove(@Param('mediaId', ParseUUIDPipe) mediaId: string) {
    await this.media.remove(mediaId);
  }
}
