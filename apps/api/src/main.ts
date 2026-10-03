import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: payment webhooks verify signatures over the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  if (config.get<string>('TRUST_PROXY', 'false') === 'true') app.set('trust proxy', true);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get<string>('WEB_ORIGIN', 'http://localhost:5180'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => new BadRequestException({ statusCode: 400, error: 'Bad Request', ...flattenErrors(errors) }),
    }),
  );

  const port = Number(config.get<string>('PORT', '3000'));
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`);
}

/** Validation errors as a readable message list plus the offending field paths, so forms can highlight them. */
function flattenErrors(errors: ValidationError[]) {
  const message: string[] = [];
  const fields: string[] = [];
  const walk = (list: ValidationError[], prefix = '') => {
    for (const error of list) {
      const path = prefix ? `${prefix}.${error.property}` : error.property;
      if (error.constraints) {
        message.push(...Object.values(error.constraints));
        fields.push(path);
      }
      if (error.children?.length) walk(error.children, path);
    }
  };
  walk(errors);
  return { message, fields };
}

void bootstrap();
