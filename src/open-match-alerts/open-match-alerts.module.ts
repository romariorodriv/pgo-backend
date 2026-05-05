import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenMatchAlertsController } from './open-match-alerts.controller';
import { OpenMatchAlertsService } from './open-match-alerts.service';

@Module({
  imports: [PrismaModule],
  controllers: [OpenMatchAlertsController],
  providers: [OpenMatchAlertsService],
})
export class OpenMatchAlertsModule {}
