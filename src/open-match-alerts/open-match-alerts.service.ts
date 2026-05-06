import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpenMatchAlertStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpenMatchAlertDto } from './dto/create-open-match-alert.dto';

@Injectable()
export class OpenMatchAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    void this.notificationsService.sendToAllUsers(
      {
        title: 'Nuevo partido abierto',
        body: `${alert.organizer.name} busca ${alert.missingPlayers} jugador${alert.missingPlayers === 1 ? '' : 'es'} en ${alert.club}.`,
        data: this.notificationData('OPEN_MATCH_CREATED', alert.id),
      },
      { excludeUserIds: [userId] },
    );

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

    const updatedAlert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      include: this.include(userId),
    });
    if (!updatedAlert) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    const joinedUser = updatedAlert.participants.find(
      (participant) => participant.userId === userId,
    )?.user;
    const joinedName = joinedUser?.name || 'Un jugador';
    const remainingPlayers = Math.max(
      updatedAlert.missingPlayers - updatedAlert.participants.length,
      0,
    );
    const previousParticipantIds = updatedAlert.participants
      .map((participant) => participant.userId)
      .filter((participantUserId) => participantUserId !== userId);

    void this.notificationsService.sendToUser(userId, {
      title: 'Ya estas dentro del partido',
      body: `${updatedAlert.category} - ${updatedAlert.format} en ${updatedAlert.club}.`,
      data: this.notificationData('OPEN_MATCH_JOIN_CONFIRMED', updatedAlert.id),
    });

    void this.notificationsService.sendToUser(updatedAlert.organizerId, {
      title:
        remainingPlayers === 0
          ? 'Tu partido ya esta completo'
          : `${joinedName} se unio a tu partido`,
      body:
        remainingPlayers === 0
          ? `${updatedAlert.club} ya tiene todos los jugadores confirmados.`
          : `Ahora faltan ${remainingPlayers} jugador${remainingPlayers === 1 ? '' : 'es'} para completar el partido.`,
      data: this.notificationData('OPEN_MATCH_PLAYER_JOINED', updatedAlert.id),
    });

    if (remainingPlayers === 1) {
      void this.notificationsService.sendToUser(updatedAlert.organizerId, {
        title: 'Te falta 1 jugador',
        body: `Tu partido en ${updatedAlert.club} esta a un cupo de completarse.`,
        data: this.notificationData('OPEN_MATCH_ALMOST_FULL', updatedAlert.id),
      });
    }

    if (remainingPlayers === 0) {
      void this.notificationsService.sendToUsers(previousParticipantIds, {
        title: 'Partido completo',
        body: `${updatedAlert.category} - ${updatedAlert.format} en ${updatedAlert.club} ya esta listo.`,
        data: this.notificationData('OPEN_MATCH_FULL', updatedAlert.id),
      });
    }

    return this.findOne(id, userId);
  }

  private notificationData(type: string, alertId: string) {
    return {
      type,
      screen: 'open_match_alert',
      alertId,
    };
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
