import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TournamentRegistrationMode,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

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
        registrations: {
          where: {
            status: {
              not: TournamentRegistrationStatus.CANCELED,
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
        'Solo el creador puede administrar los partidos de este torneo',
      );
    }

    const pairedEntries = tournament.registrations.filter(
      (registration) =>
        registration.partnerUser != null &&
        registration.mode === TournamentRegistrationMode.WITH_PARTNER,
    );

    const pairings = pairedEntries.map((entry) => ({
      registrationId: entry.id,
      teamLabel: `${entry.user.name} / ${entry.partnerUser!.name}`,
    }));

    const matches = [] as Array<{
      id: string;
      courtLabel: string;
      stageLabel: string;
      teamOne: string;
      teamTwo: string;
      scheduledAt: string;
      status: 'PENDING' | 'LIVE' | 'FINISHED';
      score: string | null;
      winnerLabel: string | null;
    }>;

    for (let index = 0; index + 1 < pairings.length; index += 2) {
      const matchNumber = matches.length + 1;
      const pairA = pairings[index];
      const pairB = pairings[index + 1];
      const status =
        matchNumber % 3 === 1
          ? 'PENDING'
          : matchNumber % 3 === 2
            ? 'LIVE'
            : 'FINISHED';

      matches.push({
        id: `tm-${tournament.id}-${matchNumber}`,
        courtLabel: `CANCHA ${matchNumber}`,
        stageLabel: 'octavos',
        teamOne: pairA.teamLabel,
        teamTwo: pairB.teamLabel,
        scheduledAt: new Date(
          tournament.startsAt.getTime() + matchNumber * 20 * 60 * 1000,
        ).toISOString(),
        status,
        score: status === 'LIVE' ? '6-3' : null,
        winnerLabel:
          status === 'FINISHED' ? `Ganador: ${pairA.teamLabel}` : null,
      });
    }

    return {
      tournament: {
        id: tournament.id,
        title: tournament.title,
        category: tournament.category,
        location: tournament.location,
        startsAt: tournament.startsAt,
        photoUrl: tournament.photoUrl,
      },
      summary: {
        totalMatches: matches.length,
        completedMatches: matches.filter((match) => match.status === 'FINISHED')
          .length,
        liveMatches: matches.filter((match) => match.status === 'LIVE').length,
      },
      matches,
    };
  }

  async getAdminBracket(tournamentId: string, userId: string) {
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
        registrations: {
          where: {
            status: {
              not: TournamentRegistrationStatus.CANCELED,
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
        'Solo el creador puede administrar el bracket de este torneo',
      );
    }

    const pairedEntries = tournament.registrations.filter(
      (registration) =>
        registration.partnerUser != null &&
        registration.mode === TournamentRegistrationMode.WITH_PARTNER,
    );

    const pairings = pairedEntries.map((entry) => ({
      teamLabel: `${entry.user.name} / ${entry.partnerUser!.name}`,
    }));

    const octavos = [] as Array<{
      id: string;
      courtLabel: string;
      stageLabel: string;
      teamOne: string;
      teamTwo: string;
      scheduledAt: string;
      status: 'PENDING' | 'LIVE' | 'FINISHED';
      score: string | null;
      winnerLabel: string | null;
    }>;

    for (let index = 0; index + 1 < pairings.length; index += 2) {
      const matchNumber = octavos.length + 1;
      const pairA = pairings[index];
      const pairB = pairings[index + 1];
      const status =
        matchNumber % 3 === 1
          ? 'PENDING'
          : matchNumber % 3 === 2
            ? 'LIVE'
            : 'FINISHED';

      octavos.push({
        id: `tb-${tournament.id}-octavos-${matchNumber}`,
        courtLabel: `CANCHA ${matchNumber}`,
        stageLabel: 'octavos',
        teamOne: pairA.teamLabel,
        teamTwo: pairB.teamLabel,
        scheduledAt: new Date(
          tournament.startsAt.getTime() + matchNumber * 20 * 60 * 1000,
        ).toISOString(),
        status,
        score: status === 'LIVE' ? '6-3' : null,
        winnerLabel:
          status === 'FINISHED' ? `Ganador: ${pairA.teamLabel}` : null,
      });
    }

    const winnerSeeds = octavos
      .filter((match) => match.status === 'FINISHED')
      .map((match) => match.winnerLabel?.replace('Ganador: ', '') ?? 'TBD');

    const buildStage = (
      stageKey: 'cuartos' | 'semis' | 'final',
      count: number,
      offsetMultiplier: number,
    ) =>
      Array.from({ length: count }, (_, index) => ({
        id: `tb-${tournament.id}-${stageKey}-${index + 1}`,
        courtLabel: `CANCHA ${index + 1}`,
        stageLabel: stageKey,
        teamOne: winnerSeeds[index * 2] ?? 'TBD',
        teamTwo:
          stageKey === 'final'
            ? 'TBD'
            : winnerSeeds[index * 2 + 1] ?? 'TBD',
        scheduledAt: new Date(
          tournament.startsAt.getTime() +
            (offsetMultiplier + index) * 20 * 60 * 1000,
        ).toISOString(),
        status: 'PENDING' as const,
        score: null,
        winnerLabel: null,
      }));

    const cuartosCount = Math.max(1, Math.ceil(octavos.length / 2));
    const semisCount = Math.max(1, Math.ceil(cuartosCount / 2));

    const cuartos = buildStage('cuartos', cuartosCount, 8);
    const semis = buildStage('semis', semisCount, 16);
    const final = buildStage('final', 1, 24);

    return {
      tournament: {
        id: tournament.id,
        title: tournament.title,
        category: tournament.category,
        location: tournament.location,
        startsAt: tournament.startsAt,
        photoUrl: tournament.photoUrl,
      },
      summary: {
        totalMatches: octavos.length,
        completedMatches: octavos.filter((match) => match.status === 'FINISHED')
          .length,
        liveMatches: octavos.filter((match) => match.status === 'LIVE').length,
      },
      stages: {
        octavos,
        cuartos,
        semis,
        final,
      },
    };
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

    if (tournament.createdById != userId) {
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
    const tournament = await this.ensureTournamentOpen(tournamentId);
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

    const tournament = await this.ensureTournamentOpen(tournamentId);
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
}
