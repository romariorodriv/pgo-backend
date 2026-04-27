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
    ],
  });
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
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
