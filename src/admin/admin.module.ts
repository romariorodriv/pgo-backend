import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminAuditRepository } from './audit/admin-audit.repository';
import { AdminAuditService } from './audit/admin-audit.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthRepository } from './auth/admin-auth.repository';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminCookieService } from './auth/admin-cookie.service';
import { AdminJwtStrategy } from './auth/admin-jwt.strategy';
import { AdminTokenService } from './auth/admin-token.service';
import { AdminConfig } from './common/admin-config';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardRepository } from './dashboard/admin-dashboard.repository';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminRolesGuard } from './guards/admin-roles.guard';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AdminAuthController, AdminDashboardController],
  providers: [
    AdminConfig,
    AdminAuthRepository,
    AdminAuthService,
    AdminTokenService,
    AdminCookieService,
    AdminJwtStrategy,
    AdminAuditRepository,
    AdminAuditService,
    AdminDashboardRepository,
    AdminDashboardService,
    AdminRolesGuard,
  ],
})
export class AdminModule {}
