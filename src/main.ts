import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'share/tournaments/:id', method: RequestMethod.GET },
      { path: 'share/tournaments/:id/image', method: RequestMethod.GET },
      { path: 'share/tournaments/:id/image.jpg', method: RequestMethod.GET },
      { path: 'torneos/:slug', method: RequestMethod.GET },
      { path: 'torneos/:slug/image', method: RequestMethod.GET },
      { path: 'torneos/:slug/image.jpg', method: RequestMethod.GET },
      { path: 'partidos/:id', method: RequestMethod.GET },
      { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
      {
        path: '.well-known/apple-app-site-association',
        method: RequestMethod.GET,
      },
    ],
  });
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  app.enableCors({
    origin(origin, callback) {
      if (!origin || (!isProduction && allowedOrigins.length === 0) || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  });
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  app.use((err: any, req: any, res: any, next: any) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      const contentLength = req?.headers?.['content-length'] ?? 'unknown';
      const userId = req?.user?.id ?? req?.user?.sub ?? 'unknown';
      console.warn(
        `pgo_413 method=${req?.method} url=${req?.originalUrl ?? req?.url} content-length=${contentLength} userId=${userId}`,
      );
      return res.status(413).json({
        message:
          'El archivo es muy pesado. Intenta con una imagen más liviana.',
      });
    }
    return next(err);
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  app.get(PrismaService).enableShutdownHooks(app);
  await app.listen(process.env.PORT ?? 3000, '127.0.0.1');
}
bootstrap();
