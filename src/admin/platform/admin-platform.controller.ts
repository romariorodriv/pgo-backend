import { Body, Controller, Get, Patch, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import type { CurrentAdmin } from '../auth/admin-auth.types';
import { adminOk } from '../common/admin-response';
import { CurrentAdminUser } from '../decorators/current-admin.decorator';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminClubStatusDto, AdminPlatformQuery } from './admin-platform.dto';
import { AdminPlatformService } from './admin-platform.service';

@UseGuards(AdminJwtAuthGuard,AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN)
@Controller('admin/platform')
export class AdminPlatformController {
  constructor(private readonly platform:AdminPlatformService){}
  @Get('summary') async summary(){return adminOk(await this.platform.summary());}
  @Get('clubs') async clubs(@Query() query:AdminPlatformQuery){return adminOk(await this.platform.clubs(query));}
  @Get('users') async users(@Query() query:AdminPlatformQuery){return adminOk(await this.platform.users(query));}
  @Get('courts') async courts(@Query() query:AdminPlatformQuery){return adminOk(await this.platform.courts(query));}
  @Get('reservations') async reservations(@Query() query:AdminPlatformQuery){return adminOk(await this.platform.reservations(query));}
  @Get('audit') async audit(@Query() query:AdminPlatformQuery){return adminOk(await this.platform.audit(query));}
  @Patch('clubs/:id/status') async status(@CurrentAdminUser() admin:CurrentAdmin,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AdminClubStatusDto,@Req() req:Request){
    return adminOk(await this.platform.setClubStatus(admin,id,dto,{ipAddress:req.ip,userAgent:req.headers['user-agent']}));
  }
}
