import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3-compatible object storage: Cloudflare R2 in production, MinIO locally.
 *
 * Uploads go straight from the browser to the bucket through presigned PUT URLs, so large videos
 * never stream through (or get buffered on) an API replica.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /** Signs URLs against the endpoint the browser can reach (differs from the internal one locally). */
  private readonly signingClient: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('STORAGE_BUCKET');
    this.publicBaseUrl = (this.config.get<string>('STORAGE_PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '');
    const endpoint = this.config.getOrThrow<string>('STORAGE_ENDPOINT');
    const publicEndpoint = this.config.get<string>('STORAGE_PUBLIC_ENDPOINT') || endpoint;
    const common = {
      region: this.config.get<string>('STORAGE_REGION', 'auto'),
      forcePathStyle: this.config.get<string>('STORAGE_FORCE_PATH_STYLE', 'false') === 'true',
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('STORAGE_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('STORAGE_SECRET_KEY'),
      },
      // R2 rejects the newer default checksum headers on presigned PUTs from browsers.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.client = new S3Client({ ...common, endpoint });
    this.signingClient = new S3Client({ ...common, endpoint: publicEndpoint });
  }

  /** URL a browser can load the object from. Public bucket URL when configured, else an API redirect to a signed URL. */
  publicUrl(key: string): string {
    if (this.publicBaseUrl) return `${this.publicBaseUrl}/${key}`;
    return `/api/files/${key}`;
  }

  async signedReadUrl(key: string, expiresIn = 3600) {
    return getSignedUrl(this.signingClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  async presignUpload(key: string, contentType: string, expiresIn = 30 * 60) {
    return getSignedUrl(
      this.signingClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  async putObject(key: string, body: Buffer, contentType: string, cacheControl = 'public, max-age=31536000, immutable') {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }),
    );
  }

  async headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(head.ContentLength ?? 0), contentType: head.ContentType };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (error as Error).name === 'NotFound') return null;
      throw error;
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) return Buffer.alloc(0);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  /** Best-effort delete; failures are logged so a storage hiccup never blocks a database change. */
  async deleteObjects(keys: string[]) {
    const unique = [...new Set(keys.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 1000) {
      const chunk = unique.slice(i, i + 1000);
      try {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
        );
      } catch (error) {
        this.logger.warn(`Failed to delete ${chunk.length} object(s): ${(error as Error).message}`);
      }
    }
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      await this.deleteObjects((page.Contents ?? []).map((object) => object.Key ?? ''));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}

