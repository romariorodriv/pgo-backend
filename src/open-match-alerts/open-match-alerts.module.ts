import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenMatchAlertsController } from './open-match-alerts.controller';
import { OpenMatchAlertsService } from './open-match-alerts.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [OpenMatchAlertsController],
  providers: [OpenMatchAlertsService],
})
export class OpenMatchAlertsModule {}
