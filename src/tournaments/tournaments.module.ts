import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TournamentShareController } from './tournament-share.controller';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TournamentsController, TournamentShareController],
  providers: [TournamentsService],
})
export class TournamentsModule {}
