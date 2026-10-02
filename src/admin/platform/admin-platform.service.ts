import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClubStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CurrentAdmin, RequestMeta } from '../auth/admin-auth.types';
import { AdminClubStatusDto, AdminPlatformQuery } from './admin-platform.dto';

@Injectable()
export class AdminPlatformService {
  constructor(private readonly prisma: PrismaService) {}
  async summary() {
    const [users, clubs, pendingClubs, approvedClubs, courts, reservations] = await Promise.all([
      this.prisma.user.count(), this.prisma.club.count(),
      this.prisma.club.count({ where: { status: ClubStatus.PENDING } }),
      this.prisma.club.count({ where: { status: ClubStatus.APPROVED } }),
      this.prisma.court.count(), this.prisma.reservation.count(),
    ]);
    return { users, clubs, pendingClubs, approvedClubs, courts, reservations };
  }
  private pagination(query: AdminPlatformQuery) {
    return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
  }
  async clubs(query: AdminPlatformQuery) {
    const where: Prisma.ClubWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: ['name', 'email', 'district', 'city'].map(key => ({ [key]: { contains: query.q, mode: 'insensitive' } })) } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.club.findMany({ where, ...this.pagination(query), orderBy: [{createdAt:'desc'},{id:'asc'}],
        select: { id:true, name:true, email:true, phone:true, address:true, district:true, city:true, status:true, createdAt:true,
          members:{select:{role:true,user:{select:{id:true,name:true,email:true}}}},
          _count:{select:{courts:true,reservations:true}} } }),
      this.prisma.club.count({ where }),
    ]);
    return { items, total, page:query.page, pageSize:query.pageSize };
  }
  async users(query: AdminPlatformQuery) {
    const where: Prisma.UserWhereInput = query.q ? { OR: [{name:{contains:query.q,mode:'insensitive'}},{email:{contains:query.q,mode:'insensitive'}}] } : {};
    const [items,total] = await Promise.all([
      this.prisma.user.findMany({where,...this.pagination(query),orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,name:true,email:true,isActive:true,createdAt:true}}),
      this.prisma.user.count({where}),
    ]);
    return {items,total,page:query.page,pageSize:query.pageSize};
  }
  async courts(query: AdminPlatformQuery) {
    const where: Prisma.CourtWhereInput = query.q ? {OR:[{name:{contains:query.q,mode:'insensitive'}},{club:{name:{contains:query.q,mode:'insensitive'}}}]} : {};
    const [items,total]=await Promise.all([
      this.prisma.court.findMany({where,...this.pagination(query),orderBy:[{name:'asc'},{id:'asc'}],select:{id:true,name:true,status:true,active:true,indoor:true,surface:true,club:{select:{id:true,name:true,status:true}}}}),
      this.prisma.court.count({where}),
    ]);
    return {items,total,page:query.page,pageSize:query.pageSize};
  }
  async reservations(query: AdminPlatformQuery) {
    const where: Prisma.ReservationWhereInput = query.q ? {OR:[{bookingCode:{contains:query.q,mode:'insensitive'}},{guestName:{contains:query.q,mode:'insensitive'}},{club:{name:{contains:query.q,mode:'insensitive'}}}]} : {};
    const [items,total]=await Promise.all([
      this.prisma.reservation.findMany({where,...this.pagination(query),orderBy:[{startAt:'desc'},{id:'asc'}],select:{id:true,bookingCode:true,startAt:true,endAt:true,price:true,status:true,source:true,guestName:true,club:{select:{id:true,name:true}},court:{select:{id:true,name:true}},player:{select:{id:true,name:true}}}}),
      this.prisma.reservation.count({where}),
    ]);
    return {items,total,page:query.page,pageSize:query.pageSize};
  }
  async audit(query: AdminPlatformQuery) {
    const where: Prisma.AdminAuditLogWhereInput = query.q ? { OR: [{action:{contains:query.q,mode:'insensitive'}},{entityId:{contains:query.q,mode:'insensitive'}}] } : {};
    const [items,total]=await Promise.all([
      this.prisma.adminAuditLog.findMany({where,...this.pagination(query),orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,action:true,entityType:true,entityId:true,createdAt:true,adminUser:{select:{name:true}}}}),
      this.prisma.adminAuditLog.count({where}),
    ]);
    return {items,total,page:query.page,pageSize:query.pageSize};
  }
  async setClubStatus(admin: CurrentAdmin,id:string,dto:AdminClubStatusDto,meta:RequestMeta) {
    return this.prisma.$transaction(async tx=>{
      const club=await tx.club.findUnique({where:{id},select:{id:true,name:true,status:true}});
      if(!club)throw new NotFoundException('Club no encontrado');
      if(club.status!==dto.expectedStatus)throw new ConflictException('El estado cambió. Actualiza la lista antes de continuar.');
      if(club.status===dto.status)return club;
      const changed=await tx.club.updateMany({where:{id,status:dto.expectedStatus},data:{status:dto.status}});
      if(changed.count!==1)throw new ConflictException('Otro administrador modificó este club. Actualiza la lista.');
      await tx.adminAuditLog.create({data:{adminUserId:admin.id,action:'CLUB_STATUS_CHANGED',entityType:'Club',entityId:id,metadata:{from:club.status,to:dto.status},...meta}});
      return tx.club.findUniqueOrThrow({where:{id},select:{id:true,name:true,status:true}});
    });
  }
}
