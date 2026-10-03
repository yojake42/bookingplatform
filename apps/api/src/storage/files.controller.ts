import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StorageService } from './storage.service';

/**
 * Only used when STORAGE_PUBLIC_BASE_URL is not configured: redirects stable media URLs to
 * short-lived signed URLs so the bucket can stay private.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get('*path')
  async redirect(@Req() request: Request, @Res() response: Response) {
    const key = decodeURIComponent(request.path.replace(/^\/api\/files\//, ''));
    if (!key.startsWith('listings/') || key.includes('..')) throw new NotFoundException();
    const url = await this.storage.signedReadUrl(key, 3600);
    response.setHeader('Cache-Control', 'private, max-age=3000');
    response.redirect(302, url);
  }
}
