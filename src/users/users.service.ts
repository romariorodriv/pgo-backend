import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findCommunity(currentUserId: string, query?: string) {
    const search = query?.trim();

    return this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        ...(search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            photoUrl: true,
            category: true,
            rankingPosition: true,
            preferredClub: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
      take: search ? 20 : 50,
    });
  }
}
