import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchStatus,
  OpenMatchInvitationStatus,
  OpenMatchAlertStatus,
  OpenMatchCoordinationStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpenMatchAlertDto } from './dto/create-open-match-alert.dto';
import { PublicOpenMatchPreviewDto } from './dto/public-open-match-preview.dto';

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

  async findPublicPreview(
    id: string,
  ): Promise<PublicOpenMatchPreviewDto | null> {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      select: {
        id: true,
        category: true,
        format: true,
        startsAt: true,
        club: true,
        district: true,
        missingPlayers: true,
        status: true,
        _count: {
          select: {
            participants: true,
          },
        },
      },
    });

    if (!alert) return null;

    return {
      id: alert.id,
      category: alert.category,
      format: alert.format,
      startsAt: alert.startsAt,
      club: alert.club,
      district: alert.district,
      missingPlayers: Math.max(
        alert.missingPlayers - alert._count.participants,
        0,
      ),
      status: alert.status,
    };
  }

  async remove(id: string, userId: string) {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        status: true,
        resultMatchId: true,
        club: true,
        category: true,
        format: true,
        participants: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!alert || alert.status === OpenMatchAlertStatus.CANCELED) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    if (alert.organizerId !== userId) {
      throw new ForbiddenException(
        'Solo el creador puede eliminar esta alerta',
      );
    }

    if (
      alert.status === OpenMatchAlertStatus.COMPLETED ||
      alert.resultMatchId
    ) {
      throw new BadRequestException(
        'No puedes eliminar una alerta con resultado registrado',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.openMatchAlert.update({
        where: { id },
        data: { status: OpenMatchAlertStatus.CANCELED },
      });
      await tx.openMatchInvitation.updateMany({
        where: {
          alertId: id,
          status: OpenMatchInvitationStatus.PENDING,
        },
        data: {
          status: OpenMatchInvitationStatus.CANCELED,
          respondedAt: new Date(),
        },
      });
    });

    const participantIds = alert.participants.map((item) => item.userId);
    if (participantIds.length > 0) {
      void this.notificationsService.sendToUsers(participantIds, {
        title: 'Partido cancelado',
        body: `${alert.category} - ${alert.format} en ${alert.club} fue cancelado por el organizador.`,
        data: this.notificationData('OPEN_MATCH_CANCELED', alert.id),
      });
    }

    return { deleted: true };
  }

  async create(userId: string, body: CreateOpenMatchAlertDto) {
    this.validateCreate(body);
    const invitedUserIds = [...new Set(body.invitedUserIds ?? [])].filter(
      (id) => id && id !== userId,
    );
    if (invitedUserIds.length > body.missingPlayers) {
      throw new BadRequestException('Hay mas invitados que cupos disponibles');
    }
    await this.validateInvitees(userId, invitedUserIds, body);

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
        invitations: {
          create: invitedUserIds.map((invitedUserId) => ({
            inviteeId: invitedUserId,
          })),
        },
        status: OpenMatchAlertStatus.OPEN,
      },
      include: this.include(userId),
    });

    const remainingPlayers = body.missingPlayers;
    if (remainingPlayers > 0) {
      void this.notificationsService.sendToAllUsers(
        {
          title: 'Nuevo partido abierto',
          body: `${alert.organizer.name} busca ${remainingPlayers} jugador${remainingPlayers === 1 ? '' : 'es'} en ${alert.club}.`,
          data: this.notificationData('OPEN_MATCH_CREATED', alert.id),
        },
        { excludeUserIds: [userId, ...invitedUserIds] },
      );
    }

    if (invitedUserIds.length > 0) {
      void this.notificationsService.sendToUsers(invitedUserIds, {
        title: 'Te invitaron a un partido',
        body: `${alert.organizer.name} te invito a ${alert.category} - ${alert.format} en ${alert.club}.`,
        data: this.notificationData('OPEN_MATCH_INVITED', alert.id),
      });
    }

    return this.mapAlert(alert, userId);
  }

  private validateCreate(body: CreateOpenMatchAlertDto) {
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Fecha invalida');
    }
    if (startsAt.getTime() < Date.now() + 30 * 60 * 1000) {
      throw new BadRequestException(
        'El partido debe iniciar al menos en 30 minutos',
      );
    }
    const format = body.format.trim().toLowerCase();
    if (!['singles', 'dobles'].includes(format)) {
      throw new BadRequestException('Formato invalido');
    }
    if (format === 'singles' && body.missingPlayers !== 1) {
      throw new BadRequestException('Singles solo permite 1 jugador faltante');
    }
    if (
      !body.club.trim() ||
      !body.category.trim() ||
      !body.paymentLabel.trim()
    ) {
      throw new BadRequestException('Completa los datos obligatorios');
    }
    if ((body.comment ?? '').length > 240) {
      throw new BadRequestException(
        'El comentario no puede superar 240 caracteres',
      );
    }
  }

  private async validateInvitees(
    organizerId: string,
    invitedUserIds: string[],
    body: CreateOpenMatchAlertDto,
  ) {
    if (invitedUserIds.length === 0) return;

    const invitees = await this.prisma.user.findMany({
      where: { id: { in: invitedUserIds } },
      select: {
        id: true,
        isActive: true,
        allowMatchInvites: true,
        profile: {
          select: {
            category: true,
          },
        },
      },
    });

    if (invitees.length !== invitedUserIds.length) {
      throw new BadRequestException('Uno o mas invitados no existen');
    }

    const startsAt = new Date(body.startsAt);
    for (const invitee of invitees) {
      if (invitee.id === organizerId) {
        throw new BadRequestException('No puedes invitarte a ti mismo');
      }
      if (!invitee.isActive) {
        throw new BadRequestException('Uno o mas invitados no estan activos');
      }
      if (!invitee.allowMatchInvites) {
        throw new BadRequestException(
          'Uno o mas invitados no permiten invitaciones',
        );
      }
      if (
        !this.isCategoryCompatible(body.category, invitee.profile?.category)
      ) {
        throw new BadRequestException(
          'Uno o mas invitados no coinciden con el nivel del partido',
        );
      }
      if (await this.hasScheduleConflict(invitee.id, startsAt)) {
        throw new BadRequestException(
          'Uno o mas invitados ya tienen un partido en ese horario',
        );
      }
    }
  }

  private isCategoryCompatible(
    alertCategory: string,
    inviteeCategory?: string | null,
  ) {
    const alertRank = this.categoryRank(alertCategory);
    const inviteeRank = this.categoryRank(inviteeCategory);
    if (alertRank === null || inviteeRank === null) return true;

    return Math.abs(alertRank - inviteeRank) <= 1;
  }

  private categoryRank(category?: string | null) {
    const match = category?.match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  private async hasScheduleConflict(userId: string, startsAt: Date) {
    const windowStart = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

    const [openMatchCount, matchCount] = await Promise.all([
      this.prisma.openMatchParticipant.count({
        where: {
          userId,
          alert: {
            status: { not: OpenMatchAlertStatus.CANCELED },
            startsAt: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
        },
      }),
      this.prisma.matchParticipant.count({
        where: {
          userId,
          match: {
            status: { not: MatchStatus.CANCELED },
            playedAt: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
        },
      }),
    ]);

    return openMatchCount + matchCount > 0;
  }

  async join(id: string, userId: string) {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      include: {
        participants: true,
        invitations: {
          where: {
            inviteeId: userId,
            status: OpenMatchInvitationStatus.PENDING,
          },
        },
      },
    });

    if (!alert || alert.status === OpenMatchAlertStatus.CANCELED) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    if (alert.status === OpenMatchAlertStatus.COMPLETED) {
      throw new BadRequestException('Este partido ya fue finalizado');
    }

    if (alert.status === OpenMatchAlertStatus.FULL) {
      throw new BadRequestException('Este partido ya esta completo');
    }

    if (alert.organizerId === userId) {
      throw new BadRequestException('Ya eres el organizador de este partido');
    }

    if (alert.invitations.length > 0) {
      return this.acceptInvitation(id, userId);
    }

    await this.prisma.$transaction(async (tx) => {
      // Serialize joins per match across backend instances before counting slots.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const currentAlert = await tx.openMatchAlert.findUnique({
        where: { id },
        include: {
          participants: true,
        },
      });

      if (
        !currentAlert ||
        currentAlert.status === OpenMatchAlertStatus.CANCELED
      ) {
        throw new NotFoundException('Partido abierto no encontrado');
      }
      if (currentAlert.status === OpenMatchAlertStatus.COMPLETED) {
        throw new BadRequestException('Este partido ya fue finalizado');
      }
      if (currentAlert.organizerId === userId) {
        throw new BadRequestException(
          'Ya eres el organizador de este partido',
        );
      }
      if (
        currentAlert.participants.some(
          (participant) => participant.userId === userId,
        )
      ) {
        throw new ConflictException('Ya estas dentro de este partido');
      }

      const joinedCount = currentAlert.participants.length;
      if (
        currentAlert.status === OpenMatchAlertStatus.FULL ||
        joinedCount >= currentAlert.missingPlayers
      ) {
        if (currentAlert.status !== OpenMatchAlertStatus.FULL) {
          await tx.openMatchAlert.update({
            where: { id },
            data: { status: OpenMatchAlertStatus.FULL },
          });
        }
        throw new BadRequestException('Este partido ya esta completo');
      }

      await tx.openMatchParticipant.create({
        data: {
          alertId: id,
          userId,
        },
      });

      if (joinedCount + 1 >= currentAlert.missingPlayers) {
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

  async leave(id: string, userId: string) {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!alert || alert.status === OpenMatchAlertStatus.CANCELED) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    if (alert.organizerId === userId) {
      throw new BadRequestException(
        'El organizador debe cancelar el partido, no salir de el',
      );
    }

    if (
      alert.status === OpenMatchAlertStatus.COMPLETED ||
      alert.resultMatchId
    ) {
      throw new BadRequestException(
        'No puedes salir de un partido con resultado registrado',
      );
    }

    const participant = alert.participants.find(
      (item) => item.userId === userId,
    );
    if (!participant) {
      throw new BadRequestException('No estas dentro de este partido');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.openMatchParticipant.deleteMany({
        where: { alertId: id, userId },
      });

      if (alert.status === OpenMatchAlertStatus.FULL) {
        await tx.openMatchAlert.update({
          where: { id },
          data: { status: OpenMatchAlertStatus.OPEN },
        });
      }
    });

    const participantName = participant.user.name || 'Un jugador';
    void this.notificationsService.sendToUser(alert.organizerId, {
      title: `${participantName} salio del partido`,
      body: `${alert.category} - ${alert.format} en ${alert.club} tiene un cupo libre.`,
      data: this.notificationData('OPEN_MATCH_PLAYER_LEFT', alert.id),
    });

    return this.findOne(id, userId);
  }

  async acceptInvitation(id: string, userId: string) {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      include: {
        participants: true,
        invitations: {
          where: { inviteeId: userId },
        },
      },
    });

    if (!alert || alert.status === OpenMatchAlertStatus.CANCELED) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    if (alert.status === OpenMatchAlertStatus.COMPLETED) {
      throw new BadRequestException('Este partido ya fue finalizado');
    }

    if (
      !alert.invitations[0] ||
      alert.invitations[0].status !== OpenMatchInvitationStatus.PENDING
    ) {
      throw new NotFoundException('Invitacion pendiente no encontrada');
    }

    if (
      alert.participants.some((participant) => participant.userId === userId)
    ) {
      throw new ConflictException('Ya estas dentro de este partido');
    }

    if (await this.hasScheduleConflict(userId, alert.startsAt)) {
      throw new BadRequestException('Ya tienes un partido en ese horario');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const currentAlert = await tx.openMatchAlert.findUnique({
        where: { id },
        include: {
          participants: true,
          invitations: {
            where: { inviteeId: userId },
          },
        },
      });

      if (
        !currentAlert ||
        currentAlert.status === OpenMatchAlertStatus.CANCELED
      ) {
        throw new NotFoundException('Partido abierto no encontrado');
      }
      if (currentAlert.status === OpenMatchAlertStatus.COMPLETED) {
        throw new BadRequestException('Este partido ya fue finalizado');
      }

      const currentInvitation = currentAlert.invitations[0];
      if (
        !currentInvitation ||
        currentInvitation.status !== OpenMatchInvitationStatus.PENDING
      ) {
        throw new NotFoundException('Invitacion pendiente no encontrada');
      }
      if (
        currentAlert.participants.some(
          (participant) => participant.userId === userId,
        )
      ) {
        throw new ConflictException('Ya estas dentro de este partido');
      }

      const joinedCount = currentAlert.participants.length;
      if (
        currentAlert.status === OpenMatchAlertStatus.FULL ||
        joinedCount >= currentAlert.missingPlayers
      ) {
        throw new BadRequestException('Este partido ya esta completo');
      }

      await tx.openMatchParticipant.create({
        data: {
          alertId: id,
          userId,
        },
      });

      await tx.openMatchInvitation.update({
        where: { id: currentInvitation.id },
        data: {
          status: OpenMatchInvitationStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      if (joinedCount + 1 >= currentAlert.missingPlayers) {
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

    const invitedUser = updatedAlert.participants.find(
      (participant) => participant.userId === userId,
    )?.user;
    const invitedName = invitedUser?.name || 'Un jugador';

    void this.notificationsService.sendToUser(updatedAlert.organizerId, {
      title: `${invitedName} acepto tu invitacion`,
      body: `${updatedAlert.category} - ${updatedAlert.format} en ${updatedAlert.club}.`,
      data: this.notificationData('OPEN_MATCH_INVITATION_ACCEPTED', id),
    });

    return this.mapAlert(updatedAlert, userId);
  }

  async rejectInvitation(id: string, userId: string) {
    const invitation = await this.prisma.openMatchInvitation.findFirst({
      where: {
        alertId: id,
        inviteeId: userId,
        status: OpenMatchInvitationStatus.PENDING,
      },
      include: {
        alert: {
          include: {
            organizer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        invitee: {
          select: {
            name: true,
          },
        },
      },
    });

    if (
      !invitation ||
      invitation.alert.status === OpenMatchAlertStatus.CANCELED
    ) {
      throw new NotFoundException('Invitacion pendiente no encontrada');
    }

    await this.prisma.openMatchInvitation.update({
      where: { id: invitation.id },
      data: {
        status: OpenMatchInvitationStatus.REJECTED,
        respondedAt: new Date(),
      },
    });

    void this.notificationsService.sendToUser(invitation.alert.organizerId, {
      title: `${invitation.invitee.name || 'Un jugador'} rechazo tu invitacion`,
      body: `${invitation.alert.category} - ${invitation.alert.format} en ${invitation.alert.club}.`,
      data: this.notificationData('OPEN_MATCH_INVITATION_REJECTED', id),
    });

    return this.findOne(id, userId);
  }

  async updateCoordination(
    id: string,
    userId: string,
    status: OpenMatchCoordinationStatus,
  ) {
    const alert = await this.prisma.openMatchAlert.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!alert || alert.status === OpenMatchAlertStatus.CANCELED) {
      throw new NotFoundException('Partido abierto no encontrado');
    }

    if (alert.status === OpenMatchAlertStatus.COMPLETED) {
      throw new BadRequestException(
        'No puedes coordinar un partido finalizado',
      );
    }

    const coordinationOpensAt = new Date(
      alert.startsAt.getTime() - 60 * 60 * 1000,
    );
    if (new Date() < coordinationOpensAt) {
      throw new BadRequestException(
        'La coordinación abre 1 hora antes del partido',
      );
    }

    const isOrganizer = alert.organizerId === userId;
    const participant = alert.participants.find(
      (item) => item.userId === userId,
    );
    if (!isOrganizer && !participant) {
      throw new BadRequestException(
        'Solo los jugadores del partido pueden coordinar',
      );
    }

    const actorName = isOrganizer
      ? alert.organizer.name
      : participant?.user.name || 'Jugador';
    const message = this.coordinationMessage(status);

    await this.prisma.openMatchCoordinationUpdate.create({
      data: {
        alertId: id,
        userId,
        status,
        message,
      },
    });

    const recipientIds = [
      alert.organizerId,
      ...alert.participants.map((item) => item.userId),
    ].filter((recipientId, index, list) => {
      return recipientId !== userId && list.indexOf(recipientId) === index;
    });

    void this.notificationsService.sendToUsers(recipientIds, {
      title:
        status === OpenMatchCoordinationStatus.CANNOT_GO
          ? `${actorName} no podra ir`
          : `${actorName} actualizo su estado`,
      body: message,
      data: this.notificationData('OPEN_MATCH_COORDINATION_UPDATED', id),
    });

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
      invitations: {
        include: {
          invitee: {
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
      coordinationUpdates: {
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
          createdAt: 'desc' as const,
        },
        take: 20,
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
    const latestStatusByUser = new Map<string, any>();
    for (const update of alert.coordinationUpdates ?? []) {
      if (!latestStatusByUser.has(update.userId)) {
        latestStatusByUser.set(update.userId, update);
      }
    }
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
      invitations: (alert.invitations ?? []).map((invitation: any) => ({
        id: invitation.id,
        status: invitation.status,
        respondedAt: invitation.respondedAt,
        createdAt: invitation.createdAt,
        invitee: {
          id: invitation.invitee.id,
          name: invitation.invitee.name,
          photoUrl: invitation.invitee.profile?.photoUrl ?? null,
        },
      })),
      invitationStatus:
        alert.invitations?.find(
          (invitation: any) => invitation.inviteeId === userId,
        )?.status ?? null,
      coordinationUpdates: (alert.coordinationUpdates ?? []).map(
        (update: any) => ({
          id: update.id,
          status: update.status,
          message: update.message,
          createdAt: update.createdAt,
          user: {
            id: update.user.id,
            name: update.user.name,
            photoUrl: update.user.profile?.photoUrl ?? null,
          },
        }),
      ),
      latestCoordinationByUser: Array.from(latestStatusByUser.values()).map(
        (update: any) => ({
          userId: update.userId,
          status: update.status,
          message: update.message,
          createdAt: update.createdAt,
        }),
      ),
    };
  }

  private coordinationMessage(status: OpenMatchCoordinationStatus) {
    switch (status) {
      case OpenMatchCoordinationStatus.ARRIVED:
        return 'Ya estoy en el club';
      case OpenMatchCoordinationStatus.ON_THE_WAY:
        return 'Voy en camino';
      case OpenMatchCoordinationStatus.ARRIVING_10:
        return 'Llego en 10 min';
      case OpenMatchCoordinationStatus.CANNOT_GO:
        return 'No podre ir';
    }
  }
}
