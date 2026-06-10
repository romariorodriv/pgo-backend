import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  app.enableCors({
    origin: true,
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
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
