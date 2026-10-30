import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminRole, AdminStatus, ClubStatus } from '@prisma/client';
import { AdminPlatformService } from './admin-platform.service';

describe('AdminPlatformService club decisions',()=>{
 const admin={id:'admin',name:'Admin',email:'test@example.test',role:AdminRole.SUPER_ADMIN,status:AdminStatus.ACTIVE};
 function setup(club:any={id:'club',name:'Club',status:ClubStatus.PENDING},count=1){
  const tx={club:{findUnique:jest.fn().mockResolvedValue(club),updateMany:jest.fn().mockResolvedValue({count}),findUniqueOrThrow:jest.fn().mockResolvedValue({...club,status:ClubStatus.APPROVED})},adminAuditLog:{create:jest.fn()}};
  const prisma={$transaction:(fn:any)=>fn(tx)};return {service:new AdminPlatformService(prisma as any),tx};
 }
 it('records approval and audit in the same transaction',async()=>{const {service,tx}=setup();await service.setClubStatus(admin,'club',{status:ClubStatus.APPROVED,expectedStatus:ClubStatus.PENDING},{});expect(tx.club.updateMany).toHaveBeenCalledWith({where:{id:'club',status:ClubStatus.PENDING},data:{status:ClubStatus.APPROVED}});expect(tx.adminAuditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({adminUserId:'admin',action:'CLUB_STATUS_CHANGED',metadata:{from:ClubStatus.PENDING,to:ClubStatus.APPROVED}})});});
 it('rejects stale decisions before updating',async()=>{const {service,tx}=setup({id:'club',status:ClubStatus.SUSPENDED});await expect(service.setClubStatus(admin,'club',{status:ClubStatus.APPROVED,expectedStatus:ClubStatus.PENDING},{})).rejects.toBeInstanceOf(ConflictException);expect(tx.club.updateMany).not.toHaveBeenCalled();});
 it('rejects concurrent updates without writing an audit',async()=>{const {service,tx}=setup(undefined,0);await expect(service.setClubStatus(admin,'club',{status:ClubStatus.APPROVED,expectedStatus:ClubStatus.PENDING},{})).rejects.toBeInstanceOf(ConflictException);expect(tx.adminAuditLog.create).not.toHaveBeenCalled();});
 it('rejects missing clubs',async()=>{const {service}=setup(null);await expect(service.setClubStatus(admin,'missing',{status:ClubStatus.APPROVED,expectedStatus:ClubStatus.PENDING},{})).rejects.toBeInstanceOf(NotFoundException);});
 it('does not write duplicate decisions',async()=>{const {service,tx}=setup();await service.setClubStatus(admin,'club',{status:ClubStatus.PENDING,expectedStatus:ClubStatus.PENDING},{});expect(tx.club.updateMany).not.toHaveBeenCalled();expect(tx.adminAuditLog.create).not.toHaveBeenCalled();});
});
