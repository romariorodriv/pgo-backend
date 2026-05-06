import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpenMatchAlertStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpenMatchAlertDto } from './dto/create-open-match-alert.dto';

@Injectable()
export class OpenMatchAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const alerts = await this.prisma.openMatchAlert.findMany({
      where: {
        status: {
          not: OpenMatchAlertStatus.CANCELED,
        },
      },
      include: this.include(userId),
      orderBy: { startsAt: 'asc' },
      take: 50,
    });

    return alerts.map((alert) => this.mapAlert(alert, userId));
  }

  async findOne(id: string, userId: string) {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      include: this.include(userId),
    });

    if (!alert || alert.status === OpenMatchAlertStatus.CANCELED) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    return this.mapAlert(alert, userId);
  }

  async create(userId: string, body: CreateOpenMatchAlertDto) {
    const alert = await this.prisma.openMatchAlert.create({
      data: {
        organizerId: userId,
        category: body.category.trim(),
        format: body.format.trim(),
        startsAt: new Date(body.startsAt),
        club: body.club.trim(),
        district: body.district.trim(),
        courtStatus: body.courtStatus.trim(),
        missingPlayers: body.missingPlayers,
        costPerPerson: body.costPerPerson,
        paymentLabel: body.paymentLabel.trim(),
        comment: body.comment?.trim() || null,
      },
      include: this.include(userId),
    });

    return this.mapAlert(alert, userId);
  }

  async join(id: string, userId: string) {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      include: {
        participants: true,
      },
    });

    if (!alert || alert.status === OpenMatchAlertStatus.CANCELED) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    if (alert.status === OpenMatchAlertStatus.FULL) {
      throw new BadRequestException('Este partido ya esta completo');
    }

    if (alert.organizerId === userId) {
      throw new BadRequestException('Ya eres el organizador de este partido');
    }

    if (alert.participants.some((participant) => participant.userId === userId)) {
      throw new ConflictException('Ya estas dentro de este partido');
    }

    const joinedCount = alert.participants.length;
    if (joinedCount >= alert.missingPlayers) {
      await this.prisma.openMatchAlert.update({
        where: { id },
        data: { status: OpenMatchAlertStatus.FULL },
      });
      throw new BadRequestException('Este partido ya esta completo');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.openMatchParticipant.create({
        data: {
          alertId: id,
          userId,
        },
      });

      if (joinedCount + 1 >= alert.missingPlayers) {
        await tx.openMatchAlert.update({
          where: { id },
          data: { status: OpenMatchAlertStatus.FULL },
        });
      }
    });

    return this.findOne(id, userId);
  }

  private include(userId: string) {
    return {
      organizer: {
        select: {
          id: true,
          name: true,
          profile: {
            select: {
              photoUrl: true,
            },
          },
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              profile: {
                select: {
                  photoUrl: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
      _count: {
        select: {
          participants: true,
        },
      },
    };
  }

  private mapAlert(alert: any, userId: string) {
    const joinedCount = alert._count?.participants ?? alert.participants.length;
    return {
      id: alert.id,
      category: alert.category,
      format: alert.format,
      startsAt: alert.startsAt,
      club: alert.club,
      district: alert.district,
      courtStatus: alert.courtStatus,
      missingPlayers: Math.max(alert.missingPlayers - joinedCount, 0),
      totalMissingPlayers: alert.missingPlayers,
      joinedPlayers: joinedCount,
      costPerPerson: alert.costPerPerson,
      paymentLabel: alert.paymentLabel,
      comment: alert.comment,
      status: alert.status,
      isOrganizer: alert.organizerId === userId,
      hasJoined:
        alert.organizerId === userId ||
        alert.participants.some(
          (participant: { userId: string }) => participant.userId === userId,
        ),
      organizer: {
        id: alert.organizer.id,
        name: alert.organizer.name,
        photoUrl: alert.organizer.profile?.photoUrl ?? null,
      },
      participants: alert.participants.map((participant: any) => ({
        id: participant.user.id,
        name: participant.user.name,
        photoUrl: participant.user.profile?.photoUrl ?? null,
      })),
    };
  }
}
