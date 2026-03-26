import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    createdById: string,
    title: string,
    playerCapacity: number,
    location: string,
    startsAt: Date,
    prize: number,
    entryFee: number,
    category: string,
    description?: string,
  ) {
    return this.prisma.tournament.create({
      data: {
        createdById,
        title,
        playerCapacity,
        location,
        startsAt,
        prize,
        entryFee,
        category,
        description,
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
      },
    });

    if (!tournament) {
      throw new NotFoundException('Torneo no encontrado');
    }

    return tournament;
  }
}
