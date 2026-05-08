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
import { NotificationsService } from '../notifications/notifications.service';
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
  startedAt: Date | null;
  teamOneLabel: string;
  teamTwoLabel: string;
  winnerLabel: string | null;
  status: TournamentMatchStatus;
  score: string | null;
};

type TournamentAlertType =
  | 'BRACKET_READY'
  | 'MATCH_STARTED'
  | 'MATCH_FINISHED'
  | 'TOURNAMENT_FINISHED';

type TournamentAlertMatch = {
  id: string;
  stage: string;
  matchNumber: number;
  courtLabel: string;
  scheduledAt: Date;
  teamOneLabel: string;
  teamTwoLabel: string;
  winnerLabel: string | null;
  status: TournamentMatchStatus;
  score: string | null;
  updatedAt: Date;
};

export type TournamentSharePreview = {
  id: string;
  slug: string | null;
  title: string;
  location: string;
  district: string;
  city: string;
  startsAt: Date;
  photoUrl: string | null;
};

const FINAL_STAGE = 'final';
const GAME_STAGE_PREFIX = 'juego-';
const TOURNAMENT_GAME_COUNT = 5;

const LEGACY_STAGE_RANK: Record<string, number> = {
  octavos: 1,
  cuartos: 2,
  semis: 3,
  final: 999,
};

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    createdById: string,
    title: string,
    tournamentType: string,
    pairingMode: string | undefined,
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
    const slug = await this.generateUniqueSlug(title);
    const normalizedPairingMode =
      tournamentType.toLowerCase().includes('rey') &&
      pairingMode === 'ROTATING'
        ? 'ROTATING'
        : 'FIXED';

    const tournament = await this.prisma.tournament.create({
      data: {
        createdById,
        title,
        slug,
        tournamentType,
        pairingMode: normalizedPairingMode,
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

    if (tournament.status === TournamentStatus.PUBLISHED) {
      void this.notificationsService.sendToAllUsers(
        {
          title: 'Nuevo torneo disponible',
          body: `${tournament.title} en ${tournament.location}.`,
          data: {
            type: 'TOURNAMENT_AVAILABLE',
            screen: 'tournament_detail',
            tournamentId: tournament.id,
          },
        },
        { excludeUserIds: [createdById] },
      );
      this.scheduleTournamentStartReminder(tournament.id, tournament.startsAt);
    }

    return tournament;
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
    const tournament = await this.prisma.tournament.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
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

  async findSharePreview(identifier: string): Promise<TournamentSharePreview> {
    const tournament = await this.prisma.tournament.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        location: true,
        district: true,
        city: true,
        startsAt: true,
        photoUrl: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    return tournament;
  }

  async getAdminMatches(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentOwnership(
      tournamentId,
      userId,
    );
    const matches = await this.getPersistedMatches(tournamentId);

    return {
      tournament: this.mapAdminTournament(tournament),
      summary: this.buildSummary(matches),
      matches: matches.map((match) => this.mapTournamentMatch(match)),
    };
  }

  async getAdminBracket(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentOwnership(
      tournamentId,
      userId,
    );
    const matches = await this.getPersistedMatches(tournamentId);

    const stages = this.groupMatchesByStage(matches);

    return {
      tournament: this.mapAdminTournament(tournament),
      summary: this.buildSummary(matches),
      stages,
    };
  }

  async getPublicMatches(tournamentId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    const matches = await this.getPersistedMatches(tournamentId);

    return {
      tournament: this.mapAdminTournament(tournament),
      summary: this.buildSummary(matches),
      matches: matches.map((match) => this.mapTournamentMatch(match)),
    };
  }

  async getParticipantMatches(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    const matches = await this.getPersistedMatches(tournamentId);
    const teamLabels = await this.getParticipantTeamLabels(
      tournamentId,
      userId,
    );

    return {
      tournament: this.mapAdminTournament(tournament),
      summary: this.buildSummary(matches),
      matches: matches.map((match) =>
        this.mapTournamentMatch(match, {
          canManage: this.isUserMatch(match, teamLabels),
        }),
      ),
    };
  }

  async getPublicBracket(tournamentId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    const matches = await this.getPersistedMatches(tournamentId);

    const stages = this.groupMatchesByStage(matches);

    return {
      tournament: this.mapAdminTournament(tournament),
      summary: this.buildSummary(matches),
      stages,
    };
  }

  async getMyAlerts(userId: string) {
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        registrations: {
          some: {
            OR: [{ userId }, { partnerUserId: userId }],
            status: {
              not: TournamentRegistrationStatus.CANCELED,
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
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
        },
        matches: true,
      },
    });

    const alerts = tournaments
      .map((tournament) => this.buildTournamentAlert(tournament, userId))
      .filter((alert) => alert != null)
      .sort(
        (left, right) =>
          right!.occurredAt.getTime() - left!.occurredAt.getTime(),
      )
      .map((alert) => ({
        ...alert!,
        occurredAt: alert!.occurredAt.toISOString(),
      }));

    return { alerts };
  }

  async generateBracket(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentReadyForBracketGeneration(
      tournamentId,
      userId,
    );
    const bracketMatches = this.buildBracketMatchesFromTournament(tournament);

    await this.prisma.tournamentMatch.createMany({
      data: bracketMatches,
    });

    await this.notifyTournamentBracketReady(tournament);

    return this.getAdminBracket(tournamentId, userId);
  }

  async closeAndGenerateBracket(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentReadyForBracketGeneration(
      tournamentId,
      userId,
    );
    const bracketMatches = this.buildBracketMatchesFromTournament(tournament);

    await this.prisma.$transaction(async (tx) => {
      await tx.tournament.update({
        where: { id: tournamentId },
        data: {
          registrationsOpen: false,
        },
      });

      await tx.tournamentMatch.createMany({
        data: bracketMatches,
      });
    });

    await this.notifyTournamentBracketReady(tournament);

    return this.getAdminBracket(tournamentId, userId);
  }

  async deleteBracket(tournamentId: string, userId: string) {
    await this.ensureTournamentOwnership(tournamentId, userId);

    const startedMatches = await this.prisma.tournamentMatch.count({
      where: {
        tournamentId,
        OR: [
          {
            status: {
              not: TournamentMatchStatus.PENDING,
            },
          },
          {
            startedAt: {
              not: null,
            },
          },
        ],
      },
    });

    if (startedMatches > 0) {
      throw new BadRequestException(
        'No puedes eliminar cruces porque el torneo ya tiene partidos iniciados',
      );
    }

    const result = await this.prisma.tournamentMatch.deleteMany({
      where: { tournamentId },
    });

    return {
      deletedMatches: result.count,
    };
  }

  private async ensureTournamentReadyForBracketGeneration(
    tournamentId: string,
    userId: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
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
        'Solo el creador puede generar los cruces de este torneo',
      );
    }

    const pendingSoloRegistrations = tournament.registrations.filter(
      (registration) =>
        registration.mode === TournamentRegistrationMode.SOLO ||
        registration.partnerUserId == null,
    );

    if (pendingSoloRegistrations.length > 0) {
      throw new BadRequestException(
        'Hay jugadores buscando pareja. Emparejalos antes de generar cruces automaticamente.',
      );
    }

    const confirmedPairings = tournament.registrations.filter(
      (registration) =>
        registration.status === TournamentRegistrationStatus.CONFIRMED &&
        registration.mode === TournamentRegistrationMode.WITH_PARTNER &&
        registration.partnerUserId != null,
    );

    const pairings = confirmedPairings.map((registration) => ({
      teamLabel: `${registration.user.name} / ${registration.partnerUser!.name}`,
    }));

    if (pairings.length < 2) {
      throw new BadRequestException(
        'Se necesitan al menos dos duplas confirmadas para generar cruces',
      );
    }

    const existingMatches = await this.prisma.tournamentMatch.count({
      where: { tournamentId },
    });
    if (existingMatches > 0) {
      throw new ConflictException(
        'Este torneo ya tiene cruces generados. No se pueden regenerar desde aqui.',
      );
    }

    return tournament;
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
        startedAt: new Date(),
        score: match.score ?? '0-0',
      },
    });

    void this.notifyTournamentMatchStarted(tournamentId, updated);

    return this.mapTournamentMatch(updated);
  }

  async startParticipantMatch(
    tournamentId: string,
    matchId: string,
    userId: string,
  ) {
    const match = await this.ensureParticipantCanManageMatch(
      tournamentId,
      matchId,
      userId,
    );

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
        startedAt: new Date(),
        score: match.score ?? '0-0',
      },
    });

    void this.notifyTournamentMatchStarted(tournamentId, updated);

    return this.mapTournamentMatch(updated, { canManage: true });
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

    void this.notifyTournamentMatchFinished(tournamentId, updated);
    void this.notifyTournamentNextMatchReady(tournamentId, updated);

    return this.mapTournamentMatch(updated);
  }

  async finishParticipantMatch(
    tournamentId: string,
    matchId: string,
    userId: string,
    winnerLabel: string,
    score?: string,
  ) {
    const match = await this.ensureParticipantCanManageMatch(
      tournamentId,
      matchId,
      userId,
    );
    this.ensureValidWinner(match, winnerLabel);

    if (match.status !== TournamentMatchStatus.LIVE) {
      throw new BadRequestException(
        'Primero debes iniciar tu partido para registrar el resultado',
      );
    }

    const trimmedScore = score?.trim();
    if (!trimmedScore) {
      throw new BadRequestException('Ingresa el puntaje final del partido');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const finishedMatch = await tx.tournamentMatch.update({
        where: { id: match.id },
        data: {
          status: TournamentMatchStatus.FINISHED,
          winnerLabel,
          score: trimmedScore,
        },
      });

      await this.rebuildNextRounds(tx, tournamentId);
      return finishedMatch;
    });

    void this.notifyTournamentMatchFinished(tournamentId, updated);
    void this.notifyTournamentNextMatchReady(tournamentId, updated);

    return this.mapTournamentMatch(updated, { canManage: true });
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
        tournamentType: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    if (tournament.createdById !== userId) {
      throw new BadRequestException('Solo el creador puede editar este torneo');
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.title != null
          ? { slug: await this.generateUniqueSlug(body.title, tournamentId) }
          : {}),
        ...(body.tournamentType != null
          ? { tournamentType: body.tournamentType }
          : {}),
        ...(body.pairingMode != null
          ? {
              pairingMode:
                (body.tournamentType ?? tournament.tournamentType)
                  .toLowerCase()
                  .includes('rey') && body.pairingMode === 'ROTATING'
                  ? body.pairingMode
                  : 'FIXED',
            }
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

  private async generateUniqueSlug(title: string, currentId?: string) {
    const baseSlug = this.slugify(title);
    let candidate = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await this.prisma.tournament.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === currentId) {
        return candidate;
      }

      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  }

  private slugify(value: string) {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized.length > 0 ? normalized : 'torneo';
  }

  async registerSolo(
    tournamentId: string,
    userId: string,
    preferredSide: string,
    availability: string,
  ) {
    await this.ensureTournamentOpen(tournamentId);
    await this.ensureUserCanRegister(tournamentId, userId);

    const registration = await this.prisma.tournamentRegistration.create({
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

    await this.notifyTournamentAlmostFullIfNeeded(tournamentId);

    return registration;
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

    const registration = await this.prisma.tournamentRegistration.create({
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

    await this.notifyTournamentAlmostFullIfNeeded(tournamentId);

    return registration;
  }

  async pairAdminRegistrations(
    tournamentId: string,
    registrationId: string,
    partnerRegistrationId: string,
    adminUserId: string,
  ) {
    if (registrationId === partnerRegistrationId) {
      throw new BadRequestException(
        'Debes seleccionar dos inscripciones distintas',
      );
    }

    await this.ensureTournamentOwnership(tournamentId, adminUserId);
    await this.ensureAdminCanManageRegistrations(tournamentId);

    const [registration, partnerRegistration] = await Promise.all([
      this.prisma.tournamentRegistration.findFirst({
        where: { id: registrationId, tournamentId },
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.tournamentRegistration.findFirst({
        where: { id: partnerRegistrationId, tournamentId },
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    if (!registration || !partnerRegistration) {
      throw new NotFoundException('Inscripcion no encontrada');
    }

    if (
      registration.status !== TournamentRegistrationStatus.PENDING ||
      partnerRegistration.status !== TournamentRegistrationStatus.PENDING ||
      registration.mode !== TournamentRegistrationMode.SOLO ||
      partnerRegistration.mode !== TournamentRegistrationMode.SOLO
    ) {
      throw new BadRequestException(
        'Solo puedes emparejar jugadores que esten inscritos sin pareja',
      );
    }

    if (registration.userId === partnerRegistration.userId) {
      throw new BadRequestException(
        'No puedes emparejar un jugador consigo mismo',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentRegistration.deleteMany({
        where: {
          tournamentId,
          status: TournamentRegistrationStatus.CANCELED,
          OR: [
            { userId: registration.userId },
            { userId: partnerRegistration.userId },
            { partnerUserId: registration.userId },
            { partnerUserId: partnerRegistration.userId },
          ],
        },
      });

      await tx.tournamentRegistration.update({
        where: { id: registration.id },
        data: {
          partnerUserId: partnerRegistration.userId,
          mode: TournamentRegistrationMode.WITH_PARTNER,
          status: TournamentRegistrationStatus.CONFIRMED,
        },
      });

      await tx.tournamentRegistration.update({
        where: { id: partnerRegistration.id },
        data: {
          status: TournamentRegistrationStatus.CANCELED,
        },
      });
    });

    await this.notifyTournamentPairingCreated(
      tournamentId,
      registration.user,
      partnerRegistration.user,
    );

    return this.findOne(tournamentId);
  }

  async addAdminRegistration(
    tournamentId: string,
    userId: string,
    adminUserId: string,
    partnerUserId?: string,
  ) {
    if (partnerUserId && userId === partnerUserId) {
      throw new BadRequestException(
        'No puedes inscribir a un jugador consigo mismo',
      );
    }

    await this.ensureTournamentOwnership(tournamentId, adminUserId);
    await this.ensureAdminCanManageRegistrations(tournamentId);

    const userIds = partnerUserId ? [userId, partnerUserId] : [userId];
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (users.length !== userIds.length) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const activeRegistrations =
      await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId,
          status: {
            not: TournamentRegistrationStatus.CANCELED,
          },
          OR: [
            {
              userId: {
                in: userIds,
              },
            },
            {
              partnerUserId: {
                in: userIds,
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

    if (activeRegistrations.length > 0) {
      throw new ConflictException(
        'Uno de los jugadores ya esta inscrito en este torneo',
      );
    }

    const activePlayers = await this.getActiveTournamentPlayerIds(tournamentId);
    const availableSlots = await this.getTournamentAvailableSlots(
      tournamentId,
      activePlayers.size,
    );
    if (availableSlots < userIds.length) {
      throw new BadRequestException(
        'No hay cupos suficientes para agregar esa inscripcion',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentRegistration.deleteMany({
        where: {
          tournamentId,
          status: TournamentRegistrationStatus.CANCELED,
          OR: [
            {
              userId: {
                in: userIds,
              },
            },
            {
              partnerUserId: {
                in: userIds,
              },
            },
          ],
        },
      });

      await tx.tournamentRegistration.create({
        data: {
          tournamentId,
          userId,
          partnerUserId: partnerUserId ?? null,
          mode: partnerUserId
            ? TournamentRegistrationMode.WITH_PARTNER
            : TournamentRegistrationMode.SOLO,
          status: partnerUserId
            ? TournamentRegistrationStatus.CONFIRMED
            : TournamentRegistrationStatus.PENDING,
        },
      });
    });

    await this.notifyTournamentAlmostFullIfNeeded(tournamentId);

    return this.findOne(tournamentId);
  }

  async removeAdminRegistration(
    tournamentId: string,
    registrationId: string,
    adminUserId: string,
  ) {
    await this.ensureTournamentOwnership(tournamentId, adminUserId);
    await this.ensureAdminCanManageRegistrations(tournamentId);

    const registration = await this.prisma.tournamentRegistration.findFirst({
      where: {
        id: registrationId,
        tournamentId,
        status: {
          not: TournamentRegistrationStatus.CANCELED,
        },
      },
      include: {
        user: { select: { id: true, name: true } },
        partnerUser: { select: { id: true, name: true } },
        tournament: { select: { id: true, title: true } },
      },
    });

    if (!registration) {
      throw new NotFoundException('Inscripcion no encontrada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentRegistration.update({
        where: { id: registration.id },
        data: {
          status: TournamentRegistrationStatus.CANCELED,
        },
      });
    });

    if (registration.partnerUser) {
      await this.notifyTournamentPairingCanceled(
        registration.tournament,
        registration.user,
        registration.partnerUser,
      );
    }

    return this.findOne(tournamentId);
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

  private async ensureTournamentExists(
    tournamentId: string,
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
    const matches = await this.prisma.tournamentMatch.findMany({
      where: {
        tournamentId,
      },
      orderBy: [
        {
          matchNumber: 'asc',
        },
      ],
    });

    return matches.sort((left, right) => {
      const leftStage = this.getStageRank(left.stage);
      const rightStage = this.getStageRank(right.stage);
      return leftStage - rightStage || left.matchNumber - right.matchNumber;
    });
  }

  private groupMatchesByStage(matches: TournamentMatchRecord[]) {
    const stages: Record<string, ReturnType<typeof this.mapTournamentMatch>[]> =
      {};

    for (const match of matches) {
      stages[match.stage] ??= [];
      stages[match.stage].push(this.mapTournamentMatch(match));
    }

    return stages;
  }

  private async ensureAdminCanManageRegistrations(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        matches: {
          select: {
            id: true,
            status: true,
            startedAt: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    const startedMatch = tournament.matches.some(
      (match) =>
        match.status !== TournamentMatchStatus.PENDING ||
        match.startedAt != null,
    );

    if (startedMatch) {
      throw new BadRequestException(
        'No puedes modificar inscritos porque el torneo ya tiene partidos iniciados',
      );
    }

    if (tournament.matches.length > 0) {
      throw new BadRequestException(
        'Primero elimina los cruces pendientes para modificar inscritos',
      );
    }
  }

  private async getActiveTournamentPlayerIds(tournamentId: string) {
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: {
          not: TournamentRegistrationStatus.CANCELED,
        },
      },
      select: {
        userId: true,
        partnerUserId: true,
      },
    });

    const playerIds = new Set<string>();
    for (const registration of registrations) {
      playerIds.add(registration.userId);
      if (registration.partnerUserId) {
        playerIds.add(registration.partnerUserId);
      }
    }

    return playerIds;
  }

  private async getTournamentAvailableSlots(
    tournamentId: string,
    activePlayersCount: number,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        playerCapacity: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    return tournament.playerCapacity - activePlayersCount;
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

  private mapTournamentMatch(
    match: TournamentMatchRecord,
    options?: { canManage?: boolean },
  ) {
    return {
      id: match.id,
      courtLabel: match.courtLabel,
      stageLabel: this.getStageLabel(match.stage),
      teamOne: match.teamOneLabel,
      teamTwo: match.teamTwoLabel,
      scheduledAt: match.scheduledAt.toISOString(),
      startedAt: match.startedAt?.toISOString() ?? null,
      status: match.status,
      score: match.score,
      winnerLabel: match.winnerLabel,
      canManage: options?.canManage ?? false,
    };
  }

  private async ensureParticipantCanManageMatch(
    tournamentId: string,
    matchId: string,
    userId: string,
  ) {
    const match = await this.ensureTournamentMatch(tournamentId, matchId);
    const teamLabels = await this.getParticipantTeamLabels(
      tournamentId,
      userId,
    );

    if (!this.isUserMatch(match, teamLabels)) {
      throw new BadRequestException(
        'Solo puedes gestionar el partido en el que participas',
      );
    }

    return match;
  }

  private async getParticipantTeamLabels(tournamentId: string, userId: string) {
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: TournamentRegistrationStatus.CONFIRMED,
        OR: [{ userId }, { partnerUserId: userId }],
      },
      include: {
        user: {
          select: { name: true },
        },
        partnerUser: {
          select: { name: true },
        },
      },
    });

    return new Set(
      registrations
        .filter((registration) => registration.partnerUser != null)
        .map((registration) =>
          `${registration.user.name} / ${registration.partnerUser!.name}`.trim(),
        ),
    );
  }

  private isUserMatch(match: TournamentMatchRecord, teamLabels: Set<string>) {
    return (
      teamLabels.has(match.teamOneLabel.trim()) ||
      teamLabels.has(match.teamTwoLabel.trim())
    );
  }

  private async getMatchParticipantIds(
    tournamentId: string,
    match: Pick<TournamentMatchRecord, 'teamOneLabel' | 'teamTwoLabel'>,
  ) {
    const targetLabels = new Set([
      match.teamOneLabel.trim(),
      match.teamTwoLabel.trim(),
    ]);

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: TournamentRegistrationStatus.CONFIRMED,
        partnerUserId: {
          not: null,
        },
      },
      include: {
        user: { select: { id: true, name: true } },
        partnerUser: { select: { id: true, name: true } },
      },
    });

    const userIds = new Set<string>();
    for (const registration of registrations) {
      const label =
        `${registration.user.name} / ${registration.partnerUser!.name}`.trim();
      if (targetLabels.has(label)) {
        userIds.add(registration.userId);
        userIds.add(registration.partnerUserId!);
      }
    }

    return [...userIds];
  }

  private async notifyTournamentMatchStarted(
    tournamentId: string,
    match: TournamentMatchRecord,
  ) {
    const recipientIds = await this.getMatchParticipantIds(tournamentId, match);

    await this.notificationsService.sendToUsers(recipientIds, {
      title: 'Tu partido empezo',
      body: `${match.courtLabel} - ${this.getStageLabel(match.stage)} esta en vivo.`,
      data: {
        type: 'TOURNAMENT_MATCH_STARTED',
        screen: 'tournament_live',
        tournamentId,
        matchId: match.id,
      },
    });

    await this.notificationsService.sendToUsers(recipientIds, {
      title: 'Registra el marcador',
      body: 'Cuando termine el partido podras cargar el puntaje final.',
      data: {
        type: 'MATCH_SCORE_REQUIRED',
        screen: 'tournament_live',
        tournamentId,
        matchId: match.id,
      },
    });
  }

  private async notifyTournamentMatchFinished(
    tournamentId: string,
    match: TournamentMatchRecord,
  ) {
    const recipientIds = await this.getMatchParticipantIds(tournamentId, match);

    await this.notificationsService.sendToUsers(recipientIds, {
      title: 'Resultado registrado',
      body: `${match.winnerLabel ?? 'Una dupla'} gano ${match.score ?? 'el partido'}.`,
      data: {
        type: 'MATCH_RESULT_RECORDED',
        screen: 'tournament_live',
        tournamentId,
        matchId: match.id,
      },
    });
  }

  private async notifyTournamentNextMatchReady(
    tournamentId: string,
    finishedMatch: TournamentMatchRecord,
  ) {
    if (!finishedMatch.winnerLabel) {
      return;
    }

    const matches = await this.prisma.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ scheduledAt: 'asc' }, { matchNumber: 'asc' }],
    });
    const nextMatch = this.findNextMatchForWinner(
      matches,
      finishedMatch.winnerLabel,
    );

    if (!nextMatch) {
      return;
    }

    const recipientIds = await this.getMatchParticipantIds(
      tournamentId,
      nextMatch,
    );
    await this.notificationsService.sendToUsers(recipientIds, {
      title: 'Tu proximo partido ya esta listo',
      body: `${nextMatch.courtLabel} - ${this.getStageLabel(nextMatch.stage)}.`,
      data: {
        type: 'TOURNAMENT_NEXT_MATCH_READY',
        screen: 'tournament_live',
        tournamentId,
        matchId: nextMatch.id,
      },
    });
  }

  private scheduleTournamentStartReminder(tournamentId: string, startsAt: Date) {
    const notifyAt = startsAt.getTime() - 60 * 60 * 1000;
    const delay = notifyAt - Date.now();
    if (delay <= 0) {
      return;
    }

    const reminder = setTimeout(() => {
      void this.notifyTournamentStartReminder(tournamentId);
    }, delay);
    reminder.unref?.();
  }

  private async notifyTournamentStartReminder(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: { status: TournamentRegistrationStatus.CONFIRMED },
          select: { userId: true, partnerUserId: true },
        },
      },
    });

    if (!tournament || tournament.status === TournamentStatus.COMPLETED) {
      return;
    }

    const recipientIds = new Set<string>();
    for (const registration of tournament.registrations) {
      recipientIds.add(registration.userId);
      if (registration.partnerUserId) {
        recipientIds.add(registration.partnerUserId);
      }
    }

    await this.notificationsService.sendToUsers([...recipientIds], {
      title: 'Tu torneo empieza en 1 hora',
      body: `${tournament.title} en ${tournament.location}.`,
      data: {
        type: 'TOURNAMENT_START_REMINDER',
        screen: 'tournament_detail',
        tournamentId: tournament.id,
      },
    });
  }

  private async notifyTournamentAlmostFullIfNeeded(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: {
            status: {
              not: TournamentRegistrationStatus.CANCELED,
            },
          },
          select: {
            userId: true,
            partnerUserId: true,
          },
        },
      },
    });

    if (!tournament || !tournament.registrationsOpen) {
      return;
    }

    const playerIds = new Set<string>();
    for (const registration of tournament.registrations) {
      playerIds.add(registration.userId);
      if (registration.partnerUserId) {
        playerIds.add(registration.partnerUserId);
      }
    }

    const remaining = tournament.playerCapacity - playerIds.size;
    if (remaining <= 0 || remaining > 2) {
      return;
    }

    await this.notificationsService.sendToAllUsers(
      {
        title: 'Ultimos cupos disponibles',
        body: `${tournament.title} tiene ${remaining} cupo${remaining === 1 ? '' : 's'} libre${remaining === 1 ? '' : 's'}.`,
        data: {
          type: 'TOURNAMENT_ALMOST_FULL',
          screen: 'tournament_detail',
          tournamentId: tournament.id,
        },
      },
      { excludeUserIds: [tournament.createdById] },
    );
  }

  private async notifyTournamentBracketReady(tournament: {
    id: string;
    title: string;
    startsAt: Date;
    location: string;
    registrations: Array<{
      userId: string;
      partnerUserId: string | null;
      status: TournamentRegistrationStatus;
    }>;
  }) {
    const recipientIds = new Set<string>();

    for (const registration of tournament.registrations) {
      if (registration.status !== TournamentRegistrationStatus.CONFIRMED) {
        continue;
      }
      recipientIds.add(registration.userId);
      if (registration.partnerUserId) {
        recipientIds.add(registration.partnerUserId);
      }
    }

    await Promise.all(
      [...recipientIds].map((userId) =>
        this.notificationsService.sendToUser(userId, {
          title: 'Ya tienes partido',
          body: `${tournament.title} ya tiene cruces. Revisa tu proximo partido.`,
          data: {
            type: 'TOURNAMENT_MATCH_ASSIGNED',
            screen: 'tournament_live',
            tournamentId: tournament.id,
          },
        }),
      ),
    );
  }

  private async notifyTournamentPairingCreated(
    tournamentId: string,
    user: { id: string; name: string },
    partner: { id: string; name: string },
  ) {
    await Promise.all([
      this.notificationsService.sendToUser(user.id, {
        title: '🎉 ¡Te encontramos dupla!',
        body: 'Completa tu inscripción para asegurar tu cupo',
        data: {
          type: 'tournament_pairing_created',
          tournamentId,
          partnerId: partner.id,
          action: 'confirm_registration',
        },
      }),
      this.notificationsService.sendToUser(partner.id, {
        title: '🎉 ¡Te encontramos dupla!',
        body: 'Completa tu inscripción para asegurar tu cupo',
        data: {
          type: 'tournament_pairing_created',
          tournamentId,
          partnerId: user.id,
          action: 'confirm_registration',
        },
      }),
    ]);

    this.scheduleTournamentPairingReminder(tournamentId, user, partner);
  }

  private scheduleTournamentPairingReminder(
    tournamentId: string,
    user: { id: string; name: string },
    partner: { id: string; name: string },
  ) {
    const reminder = setTimeout(
      () => {
        void Promise.all([
          this.notificationsService.sendToUser(user.id, {
            title: '⏳ Tu dupla está esperando',
            body: 'Confirma antes de perder el cupo',
            data: {
              type: 'tournament_pairing_reminder',
              tournamentId,
              partnerId: partner.id,
              action: 'confirm_registration',
            },
          }),
          this.notificationsService.sendToUser(partner.id, {
            title: '⏳ Tu dupla está esperando',
            body: 'Confirma antes de perder el cupo',
            data: {
              type: 'tournament_pairing_reminder',
              tournamentId,
              partnerId: user.id,
              action: 'confirm_registration',
            },
          }),
        ]);
      },
      30 * 60 * 1000,
    );

    reminder.unref?.();
  }

  private async notifyTournamentPairingCanceled(
    tournament: { id: string; title: string },
    user: { id: string; name: string },
    partner: { id: string; name: string },
  ) {
    await Promise.all([
      this.notificationsService.sendToUser(user.id, {
        title: '⚠️ Tu pareja ya no está disponible',
        body: 'Buscando nueva dupla',
        data: {
          type: 'tournament_pairing_canceled',
          tournamentId: tournament.id,
          partnerId: partner.id,
        },
      }),
      this.notificationsService.sendToUser(partner.id, {
        title: '⚠️ Tu pareja ya no está disponible',
        body: 'Buscando nueva dupla',
        data: {
          type: 'tournament_pairing_canceled',
          tournamentId: tournament.id,
          partnerId: user.id,
        },
      }),
    ]);
  }

  private buildTournamentAlert(
    tournament: {
      id: string;
      title: string;
      category: string;
      location: string;
      startsAt: Date;
      status: TournamentStatus;
      updatedAt: Date;
      registrations: Array<{
        userId: string;
        partnerUserId: string | null;
        mode: TournamentRegistrationMode;
        status: TournamentRegistrationStatus;
        user: { id: string; name: string };
        partnerUser: { id: string; name: string } | null;
      }>;
      matches: TournamentAlertMatch[];
    },
    userId: string,
  ) {
    if (tournament.matches.length == 0) {
      return null;
    }

    const teamLabels = new Set(
      tournament.registrations
        .filter(
          (registration) =>
            registration.mode === TournamentRegistrationMode.WITH_PARTNER &&
            registration.partnerUser != null &&
            registration.status === TournamentRegistrationStatus.CONFIRMED &&
            (registration.userId === userId ||
              registration.partnerUserId === userId),
        )
        .map((registration) =>
          `${registration.user.name} / ${registration.partnerUser!.name}`.trim(),
        ),
    );

    if (teamLabels.size === 0) {
      return null;
    }

    const involvedMatches = tournament.matches.filter(
      (match) =>
        teamLabels.has(match.teamOneLabel.trim()) ||
        teamLabels.has(match.teamTwoLabel.trim()),
    );

    if (
      involvedMatches.length === 0 &&
      tournament.status !== TournamentStatus.COMPLETED
    ) {
      return null;
    }

    if (tournament.status === TournamentStatus.COMPLETED) {
      const finalMatch = tournament.matches
        .filter((match) => match.stage === 'final')
        .sort(
          (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
        )[0];
      const fallbackMatch = involvedMatches.sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      )[0];
      const selectedMatch =
        finalMatch ?? fallbackMatch ?? tournament.matches[0];

      if (!selectedMatch) {
        return null;
      }

      const winnerLabel = selectedMatch.winnerLabel?.trim() ?? '';
      const champions =
        winnerLabel.length > 0
          ? winnerLabel
              .split('/')
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
          : [];
      const runnerLabel =
        winnerLabel.length > 0
          ? selectedMatch.teamOneLabel.trim() === winnerLabel
            ? selectedMatch.teamTwoLabel
            : selectedMatch.teamOneLabel
          : '';
      const runnersUp =
        runnerLabel.trim().length > 0
          ? runnerLabel
              .split('/')
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
          : [];

      const userLatestMatch = involvedMatches.sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      )[0];
      const userResult =
        userLatestMatch != null
          ? this.getStageLabel(userLatestMatch.stage)
          : 'Participante';

      return {
        eventId: `TOURNAMENT_FINISHED:${tournament.id}:${tournament.updatedAt.toISOString()}`,
        type: 'TOURNAMENT_FINISHED' as TournamentAlertType,
        occurredAt: tournament.updatedAt,
        tournament: {
          id: tournament.id,
          title: tournament.title,
          category: tournament.category,
          location: tournament.location,
          startsAt: tournament.startsAt.toISOString(),
          registrationsCount: tournament.registrations.length,
        },
        match: this.mapAlertMatch(selectedMatch),
        userResult,
        champions,
        runnersUp,
      };
    }

    involvedMatches.sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
    const latest = involvedMatches[0];

    const alertType: TournamentAlertType =
      latest.status === TournamentMatchStatus.LIVE
        ? 'MATCH_STARTED'
        : latest.status === TournamentMatchStatus.FINISHED
          ? 'MATCH_FINISHED'
          : 'BRACKET_READY';

    const nextMatch =
      alertType === 'MATCH_FINISHED'
        ? this.findNextMatchForWinner(tournament.matches, latest.winnerLabel)
        : null;

    const eventId = `${alertType}:${latest.id}:${latest.updatedAt.toISOString()}`;

    return {
      eventId,
      type: alertType,
      occurredAt: latest.updatedAt,
      tournament: {
        id: tournament.id,
        title: tournament.title,
        category: tournament.category,
        location: tournament.location,
        startsAt: tournament.startsAt.toISOString(),
        registrationsCount: tournament.registrations.length,
      },
      match: this.mapAlertMatch(latest),
      ...(nextMatch != null
        ? { nextMatch: this.mapAlertMatch(nextMatch) }
        : {}),
    };
  }

  private mapAlertMatch(match: TournamentAlertMatch) {
    return {
      id: match.id,
      courtLabel: match.courtLabel,
      stageLabel: this.getStageLabel(match.stage),
      teamOne: match.teamOneLabel,
      teamTwo: match.teamTwoLabel,
      status: match.status,
      score: match.score,
      winnerLabel: match.winnerLabel,
      scheduledAt: match.scheduledAt.toISOString(),
      updatedAt: match.updatedAt.toISOString(),
    };
  }

  private findNextMatchForWinner(
    allMatches: TournamentAlertMatch[],
    winnerLabel: string | null,
  ) {
    if (winnerLabel == null || winnerLabel.trim().length === 0) {
      return null;
    }

    const normalizedWinner = winnerLabel.trim();
    const ranked = allMatches
      .map((match) => ({
        match,
        stageRank: this.getStageRank(match.stage),
      }))
      .filter(({ stageRank }) => stageRank >= 0)
      .sort(
        (left, right) =>
          left.stageRank - right.stageRank ||
          left.match.matchNumber - right.match.matchNumber,
      );

    for (const entry of ranked) {
      if (
        entry.match.status !== TournamentMatchStatus.FINISHED &&
        (entry.match.teamOneLabel.trim() === normalizedWinner ||
          entry.match.teamTwoLabel.trim() === normalizedWinner)
      ) {
        return entry.match;
      }
    }

    return null;
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
    playerCapacity: number,
    format: string,
  ): Prisma.TournamentMatchCreateManyInput[] {
    return this.buildGameMatches(
      tournamentId,
      startsAt,
      pairings,
      playerCapacity,
      format,
      1,
    );
  }

  private buildBracketMatchesFromTournament(tournament: {
    id: string;
    startsAt: Date;
    playerCapacity: number;
    format: string;
    registrations: Array<{
      user: { name: string };
      partnerUser: { name: string } | null;
    }>;
  }) {
    const pairings = tournament.registrations.map((registration) => ({
      teamLabel: `${registration.user.name} / ${registration.partnerUser!.name}`,
    }));

    return this.buildBracketMatches(
      tournament.id,
      tournament.startsAt,
      pairings,
      tournament.playerCapacity,
      tournament.format,
    );
  }

  private inferCourtCount(playerCapacity: number, format: string) {
    const playersPerCourt = format.toLowerCase().includes('single') ? 2 : 4;
    const inferred = Math.floor(playerCapacity / playersPerCourt);
    return Math.min(6, Math.max(3, inferred));
  }

  private buildGameMatches(
    tournamentId: string,
    startsAt: Date,
    pairings: Array<{ teamLabel: string }>,
    playerCapacity: number,
    format: string,
    gameIndex: number,
  ): Prisma.TournamentMatchCreateManyInput[] {
    const matches: Prisma.TournamentMatchCreateManyInput[] = [];
    const courtCount = this.inferCourtCount(playerCapacity, format);
    const groups = this.buildTournamentGroups(pairings, courtCount);
    const stage = `${GAME_STAGE_PREFIX}${gameIndex}`;
    let courtNumber = 1;

    for (const group of groups) {
      const roundMatches = this.buildRotatingPairings(group, gameIndex - 1);

      for (const [teamOne, teamTwo] of roundMatches) {
        if (courtNumber > courtCount) {
          break;
        }

        matches.push({
          tournamentId,
          stage,
          matchNumber: courtNumber,
          courtLabel: `CANCHA ${courtNumber}`,
          scheduledAt: new Date(
            startsAt.getTime() + (gameIndex - 1) * 25 * 60 * 1000,
          ),
          teamOneLabel: teamOne,
          teamTwoLabel: teamTwo,
          status: TournamentMatchStatus.PENDING,
          score: null,
          winnerLabel: null,
        });
        courtNumber += 1;
      }
    }

    return matches;
  }

  private buildTournamentGroups(
    pairings: Array<{ teamLabel: string }>,
    courtCount: number,
  ) {
    if (courtCount === 6 && pairings.length >= 12) {
      return [pairings.slice(0, 6), pairings.slice(6, 12)];
    }

    return [pairings.slice(0, courtCount * 2)];
  }

  private buildRotatingPairings(
    pairings: Array<{ teamLabel: string }>,
    roundIndex: number,
  ) {
    const labels = pairings.map((pair) => pair.teamLabel);
    const evenLabels = labels.length % 2 === 0 ? labels : [...labels, 'TBD'];
    const fixed = evenLabels[0];
    const rotating = evenLabels.slice(1);
    const rotation = rotating.length === 0 ? 0 : roundIndex % rotating.length;
    const rotated = [
      fixed,
      ...rotating.slice(rotation),
      ...rotating.slice(0, rotation),
    ];
    const matches: Array<[string, string]> = [];

    for (let index = 0; index < rotated.length / 2; index++) {
      const teamOne = rotated[index];
      const teamTwo = rotated[rotated.length - 1 - index];

      if (teamOne !== 'TBD' && teamTwo !== 'TBD') {
        matches.push([teamOne, teamTwo]);
      }
    }

    return matches;
  }

  private getStageRank(stage: string) {
    if (stage === FINAL_STAGE) {
      return 999;
    }

    if (stage.startsWith(GAME_STAGE_PREFIX)) {
      const number = Number(stage.replace(GAME_STAGE_PREFIX, ''));
      return Number.isFinite(number) ? number : 900;
    }

    return LEGACY_STAGE_RANK[stage] ?? 500;
  }

  private getGameNumber(stage: string) {
    if (!stage.startsWith(GAME_STAGE_PREFIX)) {
      return null;
    }

    const number = Number(stage.replace(GAME_STAGE_PREFIX, ''));
    return Number.isFinite(number) ? number : null;
  }

  private getStageLabel(stage: string) {
    if (stage === FINAL_STAGE) {
      return 'Final';
    }

    if (stage.startsWith(GAME_STAGE_PREFIX)) {
      const number = Number(stage.replace(GAME_STAGE_PREFIX, ''));
      return Number.isFinite(number) ? `Juego ${number}` : stage;
    }

    return stage;
  }

  private async rebuildTournamentFinal(
    tx: Prisma.TransactionClient,
    matches: TournamentMatchRecord[],
    tournament: {
      id: string;
      startsAt: Date;
    },
  ) {
    const finalMatch = matches.find((match) => match.stage === FINAL_STAGE);
    const gameMatches = matches.filter((match) =>
      match.stage.startsWith(GAME_STAGE_PREFIX),
    );
    const completedGameNumbers = new Set(
      gameMatches
        .filter((match) => match.status === TournamentMatchStatus.FINISHED)
        .map((match) => this.getGameNumber(match.stage))
        .filter((value): value is number => value != null),
    );
    const allGamesExist = Array.from(
      { length: TOURNAMENT_GAME_COUNT },
      (_, index) => index + 1,
    ).every((gameNumber) =>
      gameMatches.some(
        (match) => match.stage === `${GAME_STAGE_PREFIX}${gameNumber}`,
      ),
    );
    const allGamesFinished = gameMatches.every(
      (match) => match.status === TournamentMatchStatus.FINISHED,
    );

    if (
      !allGamesExist ||
      completedGameNumbers.size < TOURNAMENT_GAME_COUNT ||
      !allGamesFinished
    ) {
      return;
    }

    const standings = new Map<
      string,
      { teamLabel: string; wins: number; losses: number }
    >();

    for (const match of gameMatches) {
      const teamOne = match.teamOneLabel.trim();
      const teamTwo = match.teamTwoLabel.trim();
      const winner = match.winnerLabel?.trim();

      for (const team of [teamOne, teamTwo]) {
        if (team.length > 0 && team !== 'TBD') {
          standings.set(
            team,
            standings.get(team) ?? {
              teamLabel: team,
              wins: 0,
              losses: 0,
            },
          );
        }
      }

      if (winner != null && winner.length > 0) {
        const winnerStanding = standings.get(winner);
        if (winnerStanding) {
          winnerStanding.wins += 1;
        }

        const loser = winner === teamOne ? teamTwo : teamOne;
        const loserStanding = standings.get(loser);
        if (loserStanding) {
          loserStanding.losses += 1;
        }
      }
    }

    const finalists = [...standings.values()]
      .sort(
        (left, right) =>
          right.wins - left.wins ||
          left.losses - right.losses ||
          left.teamLabel.localeCompare(right.teamLabel),
      )
      .slice(0, 2)
      .map((standing) => standing.teamLabel);

    if (finalists.length < 2) {
      return;
    }

    const desiredTeamOne = finalists[0];
    const desiredTeamTwo = finalists[1];

    if (!finalMatch) {
      await tx.tournamentMatch.create({
        data: {
          tournamentId: tournament.id,
          stage: FINAL_STAGE,
          matchNumber: 1,
          courtLabel: 'CANCHA 1',
          scheduledAt: new Date(
            tournament.startsAt.getTime() +
              TOURNAMENT_GAME_COUNT * 25 * 60 * 1000,
          ),
          teamOneLabel: desiredTeamOne,
          teamTwoLabel: desiredTeamTwo,
          status: TournamentMatchStatus.PENDING,
          score: null,
          winnerLabel: null,
        },
      });
      return;
    }

    const teamLabelsChanged =
      finalMatch.teamOneLabel !== desiredTeamOne ||
      finalMatch.teamTwoLabel !== desiredTeamTwo;

    if (!teamLabelsChanged) {
      return;
    }

    const finalNeedsReset =
      finalMatch.status !== TournamentMatchStatus.PENDING ||
      finalMatch.score !== null ||
      finalMatch.winnerLabel !== null;

    await tx.tournamentMatch.update({
      where: { id: finalMatch.id },
      data: {
        teamOneLabel: desiredTeamOne,
        teamTwoLabel: desiredTeamTwo,
        ...(finalNeedsReset
          ? {
              status: TournamentMatchStatus.PENDING,
              score: null,
              winnerLabel: null,
            }
          : {}),
      },
    });
  }

  private ensureValidWinner(match: TournamentMatchRecord, winnerLabel: string) {
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
    const tournament = await tx.tournament.findUnique({
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
                name: true,
              },
            },
            partnerUser: {
              select: {
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
      return;
    }

    const matches = await tx.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ matchNumber: 'asc' }],
    });

    matches.sort((left, right) => {
      const leftStage = this.getStageRank(left.stage);
      const rightStage = this.getStageRank(right.stage);
      return leftStage - rightStage || left.matchNumber - right.matchNumber;
    });

    const stages = [...new Set(matches.map((match) => match.stage))].sort(
      (left, right) => this.getStageRank(left) - this.getStageRank(right),
    );

    if (stages.some((stage) => stage.startsWith(GAME_STAGE_PREFIX))) {
      const generatedGameNumbers = stages
        .map((stage) => this.getGameNumber(stage))
        .filter((value): value is number => value != null)
        .sort((left, right) => left - right);
      const currentGameNumber = generatedGameNumbers.at(-1);

      if (currentGameNumber != null) {
        const currentStage = `${GAME_STAGE_PREFIX}${currentGameNumber}`;
        const currentStageMatches = matches.filter(
          (match) => match.stage === currentStage,
        );
        const currentStageFinished =
          currentStageMatches.length > 0 &&
          currentStageMatches.every(
            (match) => match.status === TournamentMatchStatus.FINISHED,
          );

        if (currentStageFinished && currentGameNumber < TOURNAMENT_GAME_COUNT) {
          const nextGameNumber = currentGameNumber + 1;
          const nextStage = `${GAME_STAGE_PREFIX}${nextGameNumber}`;
          const nextStageExists = matches.some(
            (match) => match.stage === nextStage,
          );

          if (!nextStageExists) {
            const pairings = tournament.registrations.map((registration) => ({
              teamLabel: `${registration.user.name} / ${registration.partnerUser!.name}`,
            }));

            await tx.tournamentMatch.createMany({
              data: this.buildGameMatches(
                tournament.id,
                tournament.startsAt,
                pairings,
                tournament.playerCapacity,
                tournament.format,
                nextGameNumber,
              ),
            });
            return;
          }
        }
      }

      await this.rebuildTournamentFinal(tx, matches, tournament);
      return;
    }

    for (let index = 0; index < stages.length - 1; index++) {
      const currentStage = stages[index];
      const nextStage = stages[index + 1];
      const currentStageMatches = matches.filter(
        (match) => match.stage === currentStage,
      );
      const nextStageMatches = matches.filter(
        (match) => match.stage === nextStage,
      );

      if (nextStageMatches.length === 0) {
        continue;
      }

      const winners = currentStageMatches
        .filter(
          (match) =>
            match.status === TournamentMatchStatus.FINISHED &&
            match.winnerLabel != null &&
            match.winnerLabel.trim().length > 0,
        )
        .map((match) => match.winnerLabel!.trim());

      for (const nextMatch of nextStageMatches) {
        const teamOneWinnerIndex = (nextMatch.matchNumber - 1) * 2;
        const desiredTeamOne = winners[teamOneWinnerIndex] ?? 'TBD';
        const desiredTeamTwo = winners[teamOneWinnerIndex + 1] ?? 'TBD';
        const teamLabelsChanged =
          nextMatch.teamOneLabel !== desiredTeamOne ||
          nextMatch.teamTwoLabel !== desiredTeamTwo;

        if (!teamLabelsChanged) {
          continue;
        }

        const nextMatchNeedsReset =
          nextMatch.status !== TournamentMatchStatus.PENDING ||
          nextMatch.score !== null ||
          nextMatch.winnerLabel !== null;

        await tx.tournamentMatch.update({
          where: { id: nextMatch.id },
          data: {
            teamOneLabel: desiredTeamOne,
            teamTwoLabel: desiredTeamTwo,
            ...(nextMatchNeedsReset
              ? {
                  status: TournamentMatchStatus.PENDING,
                  score: null,
                  winnerLabel: null,
                }
              : {}),
          },
        });

        nextMatch.teamOneLabel = desiredTeamOne;
        nextMatch.teamTwoLabel = desiredTeamTwo;
        if (nextMatchNeedsReset) {
          nextMatch.status = TournamentMatchStatus.PENDING;
          nextMatch.score = null;
          nextMatch.winnerLabel = null;
        }
      }
    }
  }
}
