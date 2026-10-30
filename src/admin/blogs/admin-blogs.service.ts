import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import type { CurrentAdmin } from '../auth/admin-auth.types';
import { CreateBlogDto, UpdateBlogDto } from './admin-blogs.dto';

@Injectable()
export class AdminBlogsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AdminAuditService) {}

  async list(includeDeleted = false) {
    return this.prisma.blogArticle.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      select: { id:true, slug:true, title:true, excerpt:true, coverImageUrl:true, category:true, seoTitle:true, seoDescription:true, primaryKeyword:true, status:true, createdAt:true, updatedAt:true, deletedAt:true },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
  }

  async get(id: string) {
    const article = await this.prisma.blogArticle.findFirst({where:{id,deletedAt:null}});
    if (!article) throw new NotFoundException('Artículo no encontrado');
    return article;
  }

  private async ensureSlugFree(slug: string, exceptId?: string) {
    const existing = await this.prisma.blogArticle.findUnique({where:{slug}});
    if (existing && existing.id !== exceptId) throw new ConflictException('Slug ya reservado en CMS');
  }

  async create(dto: CreateBlogDto, admin: CurrentAdmin) {
    await this.ensureSlugFree(dto.slug);
    try {
      const article = await this.prisma.blogArticle.create({data:{...dto,createdByAdminId:admin.id,updatedByAdminId:admin.id}});
      await this.audit.log({adminUserId:admin.id, action:'BLOG_DRAFT_CREATED',entityType:'BLOG',entityId:article.id,metadata:{slug:article.slug}});
      return article;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Slug ya reservado');
      throw err;
    }
  }

  async update(id:string, dto:UpdateBlogDto, admin:CurrentAdmin) {
    const existing = await this.get(id);
    if (existing.status !== 'DRAFT' && existing.status !== 'PUBLISHED') throw new ConflictException('Estado no editable');
    if (existing.status === 'PUBLISHED' && dto.slug && dto.slug !== existing.slug) throw new ConflictException('No se puede cambiar el slug de un artículo publicado');
    if (dto.slug) await this.ensureSlugFree(dto.slug,id);
    const article = await this.prisma.blogArticle.update({where:{id},data:{...dto,updatedByAdminId:admin.id}});
    await this.audit.log({adminUserId:admin.id,action:'BLOG_DRAFT_UPDATED',entityType:'BLOG',entityId:id,metadata:{slug:article.slug}});
    return article;
  }

  async remove(id:string, admin:CurrentAdmin) {
    const existing = await this.get(id);
    if (existing.status !== 'DRAFT') throw new ConflictException('No se puede retirar una publicación pública por este endpoint');
    const article = await this.prisma.blogArticle.update({where:{id},data:{deletedAt:new Date(),status:'ARCHIVED',updatedByAdminId:admin.id}});
    await this.audit.log({adminUserId:admin.id,action:'BLOG_DRAFT_ARCHIVED',entityType:'BLOG',entityId:id,metadata:{slug:article.slug}});
    return { id: article.id, status: article.status, deletedAt: article.deletedAt };
  }

  async restore(id:string, admin:CurrentAdmin) {
    const article = await this.prisma.blogArticle.findUnique({where:{id}});
    if (!article || !article.deletedAt) throw new NotFoundException('Borrador archivado no encontrado');
    const restored = await this.prisma.blogArticle.update({where:{id},data:{deletedAt:null,status:'DRAFT',updatedByAdminId:admin.id}});
    await this.audit.log({adminUserId:admin.id,action:'BLOG_DRAFT_RESTORED',entityType:'BLOG',entityId:id,metadata:{slug:restored.slug}});
    return restored;
  }
}
