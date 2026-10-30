import { Body, Controller, Get, Post, Patch, Delete, Param, ParseUUIDPipe, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { adminOk } from '../common/admin-response';
import { CurrentAdminUser } from '../decorators/current-admin.decorator';
import type { CurrentAdmin } from '../auth/admin-auth.types';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { BlogPublisherService } from './blog-publisher.service';
import { AdminBlogsService } from './admin-blogs.service';
import { CreateBlogDto, UpdateBlogDto } from './admin-blogs.dto';

@UseGuards(AdminJwtAuthGuard,AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN)
@Controller('admin/blogs')
export class AdminBlogsController {
  constructor(private readonly blogs:AdminBlogsService, private readonly publisher:BlogPublisherService) {}
  @Get() async list(@Query('includeDeleted') includeDeleted?:string) { return adminOk(await this.blogs.list(includeDeleted === 'true')); }
  @Post(':id/publish') async publish(@Param('id',ParseUUIDPipe) id:string,@CurrentAdminUser() admin:CurrentAdmin) {return adminOk(await this.publisher.publish(id,admin));}
  @Post(':id/unpublish') async unpublish(@Param('id',ParseUUIDPipe) id:string,@CurrentAdminUser() admin:CurrentAdmin) {return adminOk(await this.publisher.unpublish(id,admin));}
  @Get(':id') async get(@Param('id', ParseUUIDPipe) id:string) { return adminOk(await this.blogs.get(id)); }
  @Post() async create(@Body(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true})) dto:CreateBlogDto,@CurrentAdminUser() admin:CurrentAdmin) {return adminOk(await this.blogs.create(dto,admin));}
  @Patch(':id') async update(@Param('id',ParseUUIDPipe) id:string,@Body(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true})) dto:UpdateBlogDto,@CurrentAdminUser() admin:CurrentAdmin) {const updated=await this.blogs.update(id,dto,admin);if(updated.status==='PUBLISHED')await this.publisher.publish(id,admin);return adminOk(updated);}
  @Delete(':id') async remove(@Param('id',ParseUUIDPipe) id:string,@CurrentAdminUser() admin:CurrentAdmin) {return adminOk(await this.publisher.archive(id,admin));}
  @Post(':id/restore') async restore(@Param('id',ParseUUIDPipe) id:string,@CurrentAdminUser() admin:CurrentAdmin) {return adminOk(await this.publisher.restoreArchived(id,admin));}
}
