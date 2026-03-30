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
