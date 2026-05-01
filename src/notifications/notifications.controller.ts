import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('devices')
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { token?: string; platform?: string },
  ) {
    return this.notificationsService.registerDeviceToken(
      user.id,
      body.token ?? '',
      body.platform ?? 'unknown',
    );
  }
}
