import { Module } from '@nestjs/common';
import { TournamentShareController } from './tournament-share.controller';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  controllers: [TournamentsController, TournamentShareController],
  providers: [TournamentsService],
})
export class TournamentsModule {}
