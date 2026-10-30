import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRole } from '@prisma/client';
import { adminOk } from '../common/admin-response';
import { CurrentAdminUser } from '../decorators/current-admin.decorator';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import type { CurrentAdmin } from '../auth/admin-auth.types';
import { AdminDashboardService } from './admin-dashboard.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.ANALYST)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('summary')
  async summary(@CurrentAdminUser() admin: CurrentAdmin, @Req() req: Request) {
    return adminOk(await this.dashboard.summary(admin, this.meta(req)));
  }

  @Get('activity')
  async activity(@Query('days') days = '30') {
    return adminOk(await this.dashboard.activity(Number(days)));
  }

  @Get('funnel')
  async funnel(@Query('days') days = '30') {
    return adminOk(await this.dashboard.funnel(Number(days)));
  }

  @Get('tournaments-attention')
  async tournamentsAttention() {
    return adminOk(await this.dashboard.tournamentsAttention());
  }

  @Get('recent-activity')
  async recentActivity(@Query('limit') limit = '20') {
    return adminOk(await this.dashboard.recentActivity(Number(limit)));
  }

  private meta(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }
}
