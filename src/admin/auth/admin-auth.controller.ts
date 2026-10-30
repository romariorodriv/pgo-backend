import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminRole } from '@prisma/client';
import { adminOk } from '../common/admin-response';
import { AdminConfig } from '../common/admin-config';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdminUser } from '../decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import type { CurrentAdmin } from './admin-auth.types';
import { AdminCookieService } from './admin-cookie.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cookies: AdminCookieService,
    private readonly config: AdminConfig,
  ) {}

  @Post('login')
  async login(
    @Body() body: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      body.email,
      body.password,
      this.meta(req),
    );
    this.cookies.setRefreshCookie(res, result.refreshToken);
    return adminOk({ admin: result.admin, accessToken: result.accessToken });
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertAdminRequest(req);
    const result = await this.auth.refresh(
      this.cookies.readRefreshCookie(req),
      this.meta(req),
    );
    this.cookies.setRefreshCookie(res, result.refreshToken);
    return adminOk({ admin: result.admin, accessToken: result.accessToken });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertAdminRequest(req);
    await this.auth.logout(
      this.cookies.readRefreshCookie(req),
      null,
      this.meta(req),
    );
    this.cookies.clearRefreshCookie(res);
    return adminOk({ loggedOut: true });
  }

  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.ANALYST)
  @Post('logout-all')
  async logoutAll(
    @CurrentAdminUser() admin: CurrentAdmin,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertAdminRequest(req);
    await this.auth.logoutAll(admin, this.meta(req));
    this.cookies.clearRefreshCookie(res);
    return adminOk({ loggedOut: true });
  }

  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.ANALYST)
  @Get('session')
  session(@CurrentAdminUser() admin: CurrentAdmin) {
    return adminOk(this.auth.session(admin));
  }

  private meta(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  private assertAdminRequest(req: Request) {
    const marker = req.headers['x-pgo-admin-request'];
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const originAllowed =
      !origin || this.config.allowedOrigins.includes(origin);
    const refererAllowed =
      !referer ||
      this.config.allowedOrigins.some((allowed) => referer.startsWith(allowed));
    if (marker !== '1' || !originAllowed || !refererAllowed) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ADMIN_CSRF_REJECTED',
          message: 'Solicitud no permitida',
        },
      });
    }
  }
}
