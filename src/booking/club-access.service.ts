import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubRole, GlobalRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async membership(userId: string, clubId?: string, roles?: ClubRole[]) {
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        ...(clubId ? { clubId } : {}),
        ...(roles ? { role: { in: roles } } : {}),
      },
      include: { club: true },
    });
    if (!member)
      throw new ForbiddenException({
        code: 'CLUB_MEMBERSHIP_REQUIRED',
        message: 'No administras este club',
      });
    return member;
  }

  async court(userId: string, courtId: string) {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
    });
    if (!court)
      throw new NotFoundException({
        code: 'COURT_NOT_FOUND',
        message: 'Cancha no encontrada',
      });
    await this.membership(userId, court.clubId);
    return court;
  }

  async requireGlobalAdmin(userId: string) {
    const role = await this.prisma.userGlobalRole.findUnique({
      where: { userId_role: { userId, role: GlobalRole.PGO_ADMIN } },
    });
    if (!role)
      throw new ForbiddenException({
        code: 'PGO_ADMIN_REQUIRED',
        message: 'Acceso administrativo requerido',
      });
    return role;
  }
}
