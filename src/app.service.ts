import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHealth(): { status: string; message: string } {
    return {
      status: 'ok',
      message: 'PGO backend running',
    };
  }

  async getReadiness(): Promise<{
    ok: true;
    database: 'up';
    timestamp: string;
    uptime: number;
  }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      database: 'up',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
