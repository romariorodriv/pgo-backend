import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socialService: SocialService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { googleId } as Prisma.UserWhereInput,
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

  updateById(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async findSuggestedPlayers(currentUserId: string) {
    const participations = await this.prisma.matchParticipant.findMany({
      where: {
        userId: currentUserId,
      },
      include: {
        match: {
          include: {
            participants: {
              where: {
                userId: { not: currentUserId },
              },
              select: {
                user: {
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
                },
              },
            },
          },
        },
      },
      orderBy: {
        match: {
          playedAt: 'desc',
        },
      },
      take: 50,
    });

    const seen = new Set<string>();
    const suggestions: Array<{
      id: string;
      name: string;
      profile: {
        photoUrl: string | null;
        category: string | null;
        rankingPosition: number;
        preferredClub: string | null;
      } | null;
    }> = [];

    for (const participation of participations) {
      for (const teammate of participation.match.participants) {
        if (seen.has(teammate.user.id)) {
          continue;
        }

        seen.add(teammate.user.id);
        suggestions.push(teammate.user);
      }
    }

    const statuses = await this.socialService.getConnectionStatus(
      currentUserId,
      suggestions.map((user) => user.id),
    );

    return suggestions.map((user) => {
      const connection = statuses.get(user.id);
      return {
        ...user,
        friendshipId: connection?.id ?? null,
        friendshipStatus: connection?.status ?? null,
      };
    });
  }

  async searchCommunity(currentUserId: string, query: string) {
    const search = query.trim();

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          {
            id: search,
          },
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
      },
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
      orderBy: [{ name: 'asc' }],
      take: 20,
    });

    const statuses = await this.socialService.getConnectionStatus(
      currentUserId,
      users.map((user) => user.id),
    );

    return users.map((user) => {
      const connection = statuses.get(user.id);
      return {
        ...user,
        friendshipId: connection?.id ?? null,
        friendshipStatus: connection?.status ?? null,
      };
    });
  }
}
