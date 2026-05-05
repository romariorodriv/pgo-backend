import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    MatchesModule,
    ProfileModule,
    NotificationsModule,
    SocialModule,
    TournamentsModule,
    OpenMatchAlertsModule,
  ],
  controllers: [AppController, AppLinksController],
  providers: [AppService],
})
export class AppModule {}
