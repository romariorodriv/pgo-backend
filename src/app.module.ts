import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppLinksController } from './app-links.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MatchesModule } from './matches/matches.module';
import { ProfileModule } from './profile/profile.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SocialModule } from './social/social.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { OpenMatchAlertsModule } from './open-match-alerts/open-match-alerts.module';
import { SupportModule } from './support/support.module';

function validateEnvironment(config: Record<string, unknown>) {
  const isProduction = String(config.NODE_ENV ?? '').toLowerCase() === 'production';
  const required = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGINS'];

  for (const key of required) {
    if (!String(config[key] ?? '').trim()) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const jwtSecret = String(config.JWT_SECRET ?? '');
  if (isProduction && (jwtSecret.length < 32 || jwtSecret.includes('change-me'))) {
    throw new Error('JWT_SECRET must be strong in production');
  }

  const corsOrigins = String(config.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (isProduction && corsOrigins.some((origin) => !origin.startsWith('https://'))) {
    throw new Error('CORS_ORIGINS must use HTTPS in production');
  }

  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    MatchesModule,
    ProfileModule,
    NotificationsModule,
    SocialModule,
    TournamentsModule,
    OpenMatchAlertsModule,
    SupportModule,
  ],
  controllers: [AppController, AppLinksController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
