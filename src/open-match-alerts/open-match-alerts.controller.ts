import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateOpenMatchAlertDto } from './dto/create-open-match-alert.dto';
import { OpenMatchAlertsService } from './open-match-alerts.service';

@Controller('open-match-alerts')
@UseGuards(JwtAuthGuard)
export class OpenMatchAlertsController {
  constructor(private readonly alertsService: OpenMatchAlertsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.findOne(id, user.id);
  }

  @Post()
  create(
    @Body() body: CreateOpenMatchAlertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alertsService.create(user.id, body);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.join(id, user.id);
  }
}
