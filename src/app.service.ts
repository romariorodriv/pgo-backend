import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string; message: string } {
    return {
      status: 'ok',
      message: 'PGO backend running',
    };
  }

  getReadiness(): { ok: true; timestamp: string; uptime: number } {
    return {
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
