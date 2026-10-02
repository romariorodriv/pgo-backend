import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubRole, ClubStatus, CourtStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterClubDto } from './booking.dto';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters: { name?: string; district?: string; city?: string }) {
    return this.prisma.club.findMany({
      where: {
        status: ClubStatus.APPROVED,
        ...(filters.name
          ? { name: { contains: filters.name, mode: 'insensitive' } }
          : {}),
        ...(filters.district
          ? { district: { equals: filters.district, mode: 'insensitive' } }
          : {}),
        ...(filters.city
          ? { city: { equals: filters.city, mode: 'insensitive' } }
          : {}),
      },
      include: {
        courts: {
          where: { active: true, status: { not: CourtStatus.INACTIVE } },
          select: { id: true, name: true, indoor: true, surface: true, status: true },
          orderBy: { name: 'asc' },
        },
        allowedDurations: {
          where: { active: true },
          select: { minutes: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async bySlug(slug: string) {
    const club = await this.prisma.club.findFirst({
      where: { slug, status: ClubStatus.APPROVED },
      include: {
        courts: { where: { active: true } },
        allowedDurations: { where: { active: true } },
      },
    });
    if (!club)
      throw new NotFoundException({
        code: 'CLUB_NOT_FOUND',
        message: 'Club no encontrado',
      });
    return club;
  }

  async register(userId: string, dto: RegisterClubDto) {
    const base =
      dto.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'club';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug =
        attempt === 0
          ? base
          : `${base}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        return await this.prisma.club.create({
          data: {
            ...dto,
            slug,
            members: { create: { userId, role: ClubRole.OWNER } },
          },
          include: { members: true },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
      }
    }
    throw new ConflictException({
      code: 'CLUB_SLUG_CONFLICT',
      message: 'No se pudo generar el identificador del club',
    });
  }
}
