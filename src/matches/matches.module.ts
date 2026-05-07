import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [MatchesController],
  providers: [MatchesService],
})
export class MatchesModule {}
