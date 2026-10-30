import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth(): { status: string; message: string } {
    return this.appService.getHealth();
  }

  @Get('health')
  getReadiness(): Promise<{
    ok: true;
    database: 'up';
    timestamp: string;
    uptime: number;
  }> {
    return this.appService.getReadiness();
  }
}
