import {
  Body,
  Controller,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportService } from './support.service';

@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('reports')
  createReport(
    @CurrentUser() user: { id?: string },
    @Body()
    body: {
      type?: string;
      subject?: string;
      description?: string;
      screenshotLabel?: string;
    },
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return this.supportService.createReport(user.id, body);
  }
}
