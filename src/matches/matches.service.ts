import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private readonly publicParticipantsInclude = {
    participants: {
      orderBy: {
        slot: 'asc' as const,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profile: {
              select: {
                photoUrl: true,
                category: true,
              },
            },
          },
        },
      },
    },
  };

  async create(
    createdById: string,
    clubName: string,
    playedAt: Date,
    matchType: MatchType,
    participantIds: string[],
    photoUrl?: string,
  ) {
    const uniqueParticipantIds = [...new Set(participantIds)];

    if (uniqueParticipantIds.length !== 4) {
      throw new BadRequestException(
        'Debes enviar exactamente 4 participantes unicos',
      );
    }

    if (!uniqueParticipantIds.includes(createdById)) {
      throw new BadRequestException(
        'El creador del match debe estar incluido entre los participantes',
      );
    }

    const createdMatch = await this.prisma.$transaction(async (tx) => {
      const participantUsers = await tx.user.count({
        where: {
          id: {
            in: uniqueParticipantIds,
          },
        },
      });

      if (participantUsers !== uniqueParticipantIds.length) {
        throw new BadRequestException(
          'Uno o mas participantes no existen en la comunidad',
        );
      }

      return tx.match.create({
        data: {
          createdById,
          clubName,
          playedAt,
          matchType,
          photoUrl,
          status: 'DRAFT',
          participants: {
            create: uniqueParticipantIds.map((userId, index) => ({
              userId,
              slot: index + 1,
              team: index < 2 ? 1 : 2,
            })),
          },
        },
        include: this.publicParticipantsInclude,
      });
    });

    const recipients = uniqueParticipantIds.filter((id) => id !== createdById);
    void this.notificationsService.sendToUsers(recipients, {
      title: 'Te agregaron a una actividad',
      body: 'Confirma el resultado cuando este listo.',
      data: {
        type: 'MATCH_RESULT_CONFIRMATION_REQUIRED',
        screen: 'profile_history',
        matchId: createdMatch.id,
      },
    });

    return createdMatch;
  }

  findMyMatches(userId: string) {
    return this.prisma.match.findMany({
      where: {
        createdById: userId,
      },
      orderBy: {
        playedAt: 'desc',
      },
      include: this.publicParticipantsInclude,
    });
  }

  async updateResult(
    matchId: string,
    userId: string,
    playedAt: Date,
    winnerTeam: number,
    games: Array<{ team1: number; team2: number }>,
  ) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        createdById: userId,
      },
      include: {
        participants: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        playedAt,
        winnerTeam,
        games,
        status: 'COMPLETED',
      },
      include: this.publicParticipantsInclude,
    });
  }

  async finalize(
    matchId: string,
    userId: string,
    winnerPlayerIds: string[],
    description?: string,
    photoUrl?: string,
  ) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        createdById: userId,
      },
      include: {
        participants: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Match no encontrado');
    }

    const uniqueWinnerIds = [...new Set(winnerPlayerIds)];
    if (uniqueWinnerIds.length !== 2) {
      throw new BadRequestException(
        'Debes enviar exactamente 2 ganadores unicos',
      );
    }

    if (match.status !== 'COMPLETED' || !match.winnerTeam || !match.games) {
      throw new BadRequestException(
        'Primero debes registrar el resultado del match',
      );
    }

    if (match.xpAwardedAt) {
      throw new BadRequestException('Este match ya fue finalizado');
    }

    const participantIds = match.participants.map(
      (participant) => participant.userId,
    );
    const participantIdSet = new Set(participantIds);

    const invalidWinner = uniqueWinnerIds.some(
      (winnerId) => !participantIdSet.has(winnerId),
    );

    if (invalidWinner) {
      throw new BadRequestException(
        'Los ganadores deben pertenecer a los participantes del match',
      );
    }

    const winnerParticipants = match.participants.filter((participant) =>
      uniqueWinnerIds.includes(participant.userId),
    );

    const winnerTeamSet = new Set(
      winnerParticipants.map((participant) => participant.team),
    );

    if (
      winnerParticipants.length !== 2 ||
      winnerTeamSet.size !== 1 ||
      !winnerTeamSet.has(match.winnerTeam)
    ) {
      throw new BadRequestException(
        'Los ganadores deben coincidir con el equipo ganador del match',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: matchId },
        data: {
          description,
          photoUrl,
          xpAwardedAt: new Date(),
        },
      });

      const updatedProfiles = await tx.profile.updateMany({
        where: {
          userId: {
            in: uniqueWinnerIds,
          },
        },
        data: {
          experiencePoints: {
            increment: 30,
          },
          wins: {
            increment: 1,
          },
        },
      });

      if (updatedProfiles.count !== uniqueWinnerIds.length) {
        throw new BadRequestException(
          'Uno o mas ganadores no tienen perfil activo',
        );
      }
    });

    const finalized = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: this.publicParticipantsInclude,
    });

    if (finalized) {
      const participantIds = finalized.participants.map(
        (participant) => participant.userId,
      );
      const recipients = participantIds.filter((id) => id !== userId);

      void this.notificationsService.sendToUsers(recipients, {
        title: 'Resultado registrado',
        body: 'Un partido contigo ya tiene resultado. Revisa tu actividad.',
        data: {
          type: 'MATCH_RESULT_RECORDED',
          screen: 'profile_history',
          matchId: finalized.id,
        },
      });

      void this.notificationsService.sendToUsers(uniqueWinnerIds, {
        title: 'Ganaste +30 XP',
        body: 'Tu experiencia fue actualizada por el resultado del partido.',
        data: {
          type: 'XP_GAINED',
          screen: 'profile',
          matchId: finalized.id,
        },
      });
    }

    return finalized;
  }
}
