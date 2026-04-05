import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TournamentMatchStatus,
  TournamentRegistrationMode,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

type AdminTournamentSelect = {
  id: string;
  title: string;
  category: string;
  location: string;
  startsAt: Date;
  photoUrl: string | null;
  createdById: string;
};

type TournamentMatchRecord = {
  id: string;
  tournamentId: string;
  stage: string;
  matchNumber: number;
  courtLabel: string;
  scheduledAt: Date;
  teamOneLabel: string;
  teamTwoLabel: string;
  winnerLabel: string | null;
  status: TournamentMatchStatus;
  score: string | null;
};

const STAGE_SEQUENCE = ['octavos', 'cuartos', 'semis', 'final'] as const;
type StageKey = (typeof STAGE_SEQUENCE)[number];

const STAGE_LABELS: Record<StageKey, string> = {
  octavos: 'octavos',
  cuartos: 'cuartos',
  semis: 'semis',
  final: 'final',
};

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    createdById: string,
    title: string,
    tournamentType: string,
    playerCapacity: number,
    modality: string,
    format: string,
    location: string,
    address: string | undefined,
    city: string,
    district: string,
    startsAt: Date,
    prize: string,
    entryFee: number,
    category: string,
    description?: string,
    photoUrl?: string,
    status: TournamentStatus = TournamentStatus.PUBLISHED,
    registrationsOpen = true,
  ) {
    return this.prisma.tournament.create({
      data: {
        createdById,
        title,
        tournamentType,
        playerCapacity,
        modality,
        format,
        location,
        address,
        city,
        district,
        startsAt,
        prize,
        entryFee,
        category,
        status,
        registrationsOpen,
        description,
        photoUrl,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  findAll() {
    return this.prisma.tournament.findMany({
      orderBy: {
        startsAt: 'asc',
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        registrations: {
          select: {
            id: true,
            userId: true,
            partnerUserId: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        registrations: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                profile: {
                  select: {
                    photoUrl: true,
                    category: true,
                    rankingPosition: true,
                    preferredClub: true,
                  },
                },
              },
            },
            partnerUser: {
              select: {
                id: true,
                name: true,
                email: true,
                profile: {
                  select: {
                    photoUrl: true,
                    category: true,
                    rankingPosition: true,
                    preferredClub: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    return tournament;
  }

  async getAdminMatches(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentOwnership(tournamentId, userId);
    const matches = await this.getPersistedMatches(tournamentId);

    return {
      tournament: this.mapAdminTournament(tournament),
      summary: this.buildSummary(matches),
      matches: matches.map((match) => this.mapTournamentMatch(match)),
    };
  }

  async getAdminBracket(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentOwnership(tournamentId, userId);
    const matches = await this.getPersistedMatches(tournamentId);

    const stages = Object.fromEntries(
      STAGE_SEQUENCE.map((stage) => [
        stage,
        matches
          .filter((match) => match.stage === stage)
          .map((match) => this.mapTournamentMatch(match)),
      ]),
    );

    return {
      tournament: this.mapAdminTournament(tournament),
      summary: this.buildSummary(matches),
      stages,
    };
  }

  async generateBracket(tournamentId: string, userId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: {
            status: TournamentRegistrationStatus.CONFIRMED,
            mode: TournamentRegistrationMode.WITH_PARTNER,
            partnerUserId: {
              not: null,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
            partnerUser: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    if (tournament.createdById !== userId) {
      throw new BadRequestException(
        'Solo el creador puede generar los cruces de este torneo',
      );
    }

    const pairings = tournament.registrations.map((registration) => ({
      teamLabel: `${registration.user.name} / ${registration.partnerUser!.name}`,
    }));

    if (pairings.length < 2) {
      throw new BadRequestException(
        'Se necesitan al menos dos duplas confirmadas para generar cruces',
      );
    }

    const bracketMatches = this.buildBracketMatches(
      tournament.id,
      tournament.startsAt,
      pairings,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentMatch.deleteMany({
        where: { tournamentId },
      });

      await tx.tournamentMatch.createMany({
        data: bracketMatches,
      });
    });

    return this.getAdminBracket(tournamentId, userId);
  }

  async startAdminMatch(tournamentId: string, matchId: string, userId: string) {
    await this.ensureTournamentOwnership(tournamentId, userId);
    const match = await this.ensureTournamentMatch(tournamentId, matchId);

    if (match.status !== TournamentMatchStatus.PENDING) {
      throw new BadRequestException('Solo puedes iniciar partidos pendientes');
    }

    if (
      !match.teamOneLabel ||
      !match.teamTwoLabel ||
      match.teamOneLabel === 'TBD' ||
      match.teamTwoLabel === 'TBD'
    ) {
      throw new BadRequestException(
        'Este partido aun no tiene dos duplas listas para iniciar',
      );
    }

    const updated = await this.prisma.tournamentMatch.update({
      where: { id: match.id },
      data: {
        status: TournamentMatchStatus.LIVE,
        score: match.score ?? '0-0',
      },
    });

    return this.mapTournamentMatch(updated);
  }

  async finishAdminMatch(
    tournamentId: string,
    matchId: string,
    userId: string,
    winnerLabel: string,
    score?: string,
  ) {
    await this.ensureTournamentOwnership(tournamentId, userId);
    const match = await this.ensureTournamentMatch(tournamentId, matchId);
    this.ensureValidWinner(match, winnerLabel);

    const updated = await this.prisma.$transaction(async (tx) => {
      const finishedMatch = await tx.tournamentMatch.update({
        where: { id: match.id },
        data: {
          status: TournamentMatchStatus.FINISHED,
          winnerLabel,
          score: (score?.trim().length ?? 0) > 0 ? score!.trim() : match.score,
        },
      });

      await this.rebuildNextRounds(tx, tournamentId);
      return finishedMatch;
    });

    return this.mapTournamentMatch(updated);
  }

  async correctAdminMatchResult(
    tournamentId: string,
    matchId: string,
    userId: string,
    winnerLabel: string,
    score?: string,
  ) {
    await this.ensureTournamentOwnership(tournamentId, userId);
    const match = await this.ensureTournamentMatch(tournamentId, matchId);
    this.ensureValidWinner(match, winnerLabel);

    const updated = await this.prisma.$transaction(async (tx) => {
      const correctedMatch = await tx.tournamentMatch.update({
        where: { id: match.id },
        data: {
          status: TournamentMatchStatus.FINISHED,
          winnerLabel,
          score: (score?.trim().length ?? 0) > 0 ? score!.trim() : match.score,
        },
      });

      await this.rebuildNextRounds(tx, tournamentId);
      return correctedMatch;
    });

    return this.mapTournamentMatch(updated);
  }

  async update(
    tournamentId: string,
    userId: string,
    body: UpdateTournamentDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        createdById: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    if (tournament.createdById !== userId) {
      throw new BadRequestException(
        'Solo el creador puede editar este torneo',
      );
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.tournamentType != null
          ? { tournamentType: body.tournamentType }
          : {}),
        ...(body.playerCapacity != null
          ? { playerCapacity: body.playerCapacity }
          : {}),
        ...(body.modality != null ? { modality: body.modality } : {}),
        ...(body.format != null ? { format: body.format } : {}),
        ...(body.location != null ? { location: body.location } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.city != null ? { city: body.city } : {}),
        ...(body.district != null ? { district: body.district } : {}),
        ...(body.startsAt != null ? { startsAt: new Date(body.startsAt) } : {}),
        ...(body.prize != null ? { prize: body.prize } : {}),
        ...(body.entryFee != null ? { entryFee: body.entryFee } : {}),
        ...(body.category != null ? { category: body.category } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
        ...(body.status != null ? { status: body.status } : {}),
        ...(body.registrationsOpen != null
          ? { registrationsOpen: body.registrationsOpen }
          : {}),
      },
    });

    return this.findOne(tournamentId);
  }

  async registerSolo(
    tournamentId: string,
    userId: string,
    preferredSide: string,
    availability: string,
  ) {
    await this.ensureTournamentOpen(tournamentId);
    await this.ensureUserCanRegister(tournamentId, userId);

    return this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        userId,
        mode: TournamentRegistrationMode.SOLO,
        status: TournamentRegistrationStatus.PENDING,
        preferredSide,
        availability,
      },
      include: {
        tournament: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async registerWithPartner(
    tournamentId: string,
    userId: string,
    partnerUserId: string,
  ) {
    if (userId === partnerUserId) {
      throw new BadRequestException('No puedes inscribirte contigo mismo');
    }

    await this.ensureTournamentOpen(tournamentId);
    await this.ensureUserCanRegister(tournamentId, userId);
    await this.ensureUserCanRegister(tournamentId, partnerUserId);

    const partnerUser = await this.prisma.user.findUnique({
      where: { id: partnerUserId },
      select: { id: true },
    });

    if (!partnerUser) {
      throw new NotFoundException('La pareja seleccionada no existe');
    }

    return this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        userId,
        partnerUserId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      include: {
        tournament: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        partnerUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  private async ensureTournamentOpen(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        status: true,
        registrationsOpen: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    if (tournament.status !== TournamentStatus.PUBLISHED) {
      throw new BadRequestException(
        'Solo puedes inscribirte en torneos publicados',
      );
    }

    if (!tournament.registrationsOpen) {
      throw new BadRequestException(
        'Las inscripciones para este torneo ya fueron cerradas',
      );
    }

    return tournament;
  }

  private async ensureUserCanRegister(tournamentId: string, userId: string) {
    const existing = await this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        OR: [{ userId }, { partnerUserId: userId }],
        status: {
          not: TournamentRegistrationStatus.CANCELED,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Ese jugador ya esta inscrito en este torneo',
      );
    }
  }

  private async ensureTournamentOwnership(
    tournamentId: string,
    userId: string,
  ): Promise<AdminTournamentSelect> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        title: true,
        category: true,
        location: true,
        startsAt: true,
        photoUrl: true,
        createdById: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    if (tournament.createdById !== userId) {
      throw new BadRequestException(
        'Solo el creador puede administrar este torneo',
      );
    }

    return tournament;
  }

  private async ensureTournamentMatch(
    tournamentId: string,
    matchId: string,
  ): Promise<TournamentMatchRecord> {
    const match = await this.prisma.tournamentMatch.findFirst({
      where: {
        id: matchId,
        tournamentId,
      },
    });

    if (!match) {
      throw new NotFoundException('Partido de torneo no encontrado');
    }

    return match;
  }

  private async getPersistedMatches(tournamentId: string) {
    return this.prisma.tournamentMatch.findMany({
      where: {
        tournamentId,
      },
      orderBy: [
        {
          stage: 'asc',
        },
        {
          matchNumber: 'asc',
        },
      ],
    });
  }

  private mapAdminTournament(tournament: AdminTournamentSelect) {
    return {
      id: tournament.id,
      title: tournament.title,
      category: tournament.category,
      location: tournament.location,
      startsAt: tournament.startsAt,
      photoUrl: tournament.photoUrl,
    };
  }

  private mapTournamentMatch(match: TournamentMatchRecord) {
    return {
      id: match.id,
      courtLabel: match.courtLabel,
      stageLabel: STAGE_LABELS[match.stage as StageKey] ?? match.stage,
      teamOne: match.teamOneLabel,
      teamTwo: match.teamTwoLabel,
      scheduledAt: match.scheduledAt.toISOString(),
      status: match.status,
      score: match.score,
      winnerLabel: match.winnerLabel,
    };
  }

  private buildSummary(matches: TournamentMatchRecord[]) {
    return {
      totalMatches: matches.length,
      completedMatches: matches.filter(
        (match) => match.status === TournamentMatchStatus.FINISHED,
      ).length,
      liveMatches: matches.filter(
        (match) => match.status === TournamentMatchStatus.LIVE,
      ).length,
    };
  }

  private buildBracketMatches(
    tournamentId: string,
    startsAt: Date,
    pairings: Array<{ teamLabel: string }>,
  ): Prisma.TournamentMatchCreateManyInput[] {
    const matches: Prisma.TournamentMatchCreateManyInput[] = [];
    let stageTeams = [...pairings.map((pair) => pair.teamLabel)];
    let stageIndex = 0;
    let courtSeed = 1;

    while (stageIndex < STAGE_SEQUENCE.length) {
      const stage = STAGE_SEQUENCE[stageIndex];
      const stageMatchCount =
        stage === 'final' ? 1 : Math.max(1, Math.ceil(stageTeams.length / 2));

      for (let matchIndex = 0; matchIndex < stageMatchCount; matchIndex++) {
        const teamOne = stageTeams[matchIndex * 2] ?? 'TBD';
        const teamTwo = stageTeams[matchIndex * 2 + 1] ?? 'TBD';

        matches.push({
          tournamentId,
          stage,
          matchNumber: matchIndex + 1,
          courtLabel: `CANCHA ${courtSeed}`,
          scheduledAt: new Date(
            startsAt.getTime() + matches.length * 20 * 60 * 1000,
          ),
          teamOneLabel: teamOne,
          teamTwoLabel: teamTwo,
          status:
            teamOne !== 'TBD' && teamTwo !== 'TBD'
              ? TournamentMatchStatus.PENDING
              : TournamentMatchStatus.PENDING,
          score: null,
          winnerLabel: null,
        });
        courtSeed += 1;
      }

      if (stage === 'final') {
        break;
      }

      stageTeams = Array.from({ length: stageMatchCount }, () => 'TBD');
      stageIndex += 1;

      if (stageTeams.length <= 1 && stage !== 'semis') {
        // Preserve all stages expected by the admin UI.
        continue;
      }
    }

    return matches;
  }

  private ensureValidWinner(
    match: TournamentMatchRecord,
    winnerLabel: string,
  ) {
    const normalizedWinner = winnerLabel.trim();
    const validLabels = [match.teamOneLabel.trim(), match.teamTwoLabel.trim()];

    if (!validLabels.includes(normalizedWinner)) {
      throw new BadRequestException(
        'El ganador debe coincidir con una de las duplas del partido',
      );
    }
  }

  private async rebuildNextRounds(
    tx: Prisma.TransactionClient,
    tournamentId: string,
  ) {
    const matches = await tx.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [
        { stage: 'asc' },
        { matchNumber: 'asc' },
      ],
    });

    for (let index = 0; index < STAGE_SEQUENCE.length - 1; index++) {
      const currentStage = STAGE_SEQUENCE[index];
      const nextStage = STAGE_SEQUENCE[index + 1];
      const currentStageMatches = matches.filter(
        (match) => match.stage === currentStage,
      );
      const nextStageMatches = matches.filter((match) => match.stage === nextStage);

      if (nextStageMatches.length === 0) {
        continue;
      }

      for (const nextMatch of nextStageMatches) {
        await tx.tournamentMatch.update({
          where: { id: nextMatch.id },
          data: {
            teamOneLabel: 'TBD',
            teamTwoLabel: 'TBD',
            status: TournamentMatchStatus.PENDING,
            score: null,
            winnerLabel: null,
          },
        });
      }

      const winners = currentStageMatches
        .filter(
          (match) =>
            match.status === TournamentMatchStatus.FINISHED &&
            match.winnerLabel != null &&
            match.winnerLabel.trim().length > 0,
        )
        .map((match) => match.winnerLabel!.trim());

      for (let winnerIndex = 0; winnerIndex < winners.length; winnerIndex++) {
        const targetMatchNumber = Math.floor(winnerIndex / 2) + 1;
        const targetMatch = nextStageMatches.find(
          (match) => match.matchNumber === targetMatchNumber,
        );

        if (!targetMatch) {
          continue;
        }

        await tx.tournamentMatch.update({
          where: { id: targetMatch.id },
          data:
            winnerIndex % 2 === 0
              ? { teamOneLabel: winners[winnerIndex] }
              : { teamTwoLabel: winners[winnerIndex] },
        });
      }
    }
  }
}
