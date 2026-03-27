import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MatchParticipant,
  MatchStatus,
  Prisma,
  Profile,
  User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

type UserWithProfile = User & {
  profile: Profile | null;
};

type MatchParticipantWithMatch = MatchParticipant & {
  match: {
    id: string;
    clubName: string;
    playedAt: Date;
    matchType: string;
    status: MatchStatus;
    winnerTeam: number | null;
    participants: Array<{
      slot: number;
      team: number;
      user: {
        id: string;
        name: string;
        profile: {
          photoUrl: string | null;
          category: string | null;
        } | null;
      };
    }>;
  };
};

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    return this.buildProfileResponse(userId, userId);
  }

  async getProfileById(profileUserId: string, viewerUserId: string) {
    return this.buildProfileResponse(profileUserId, viewerUserId);
  }

  async updateMyProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const { name, ...profileData } = updateProfileDto;
    const trimmedName = name?.trim();

    await this.prisma.$transaction(async (tx) => {
      if (trimmedName) {
        await tx.user.update({
          where: { id: userId },
          data: { name: trimmedName },
        });
      }

      if (Object.keys(profileData).length > 0) {
        await tx.profile.upsert({
          where: { userId },
          create: {
            userId,
            ...profileData,
          },
          update: profileData,
        });
      }
    });

    return this.getMyProfile(userId);
  }

  private async buildProfileResponse(
    profileUserId: string,
    viewerUserId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: profileUserId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const profile = await this.ensureProfile(user);

    const [matchesPlayed, recentParticipations] = await Promise.all([
      this.prisma.matchParticipant.count({
        where: {
          userId: user.id,
        },
      }),
      this.prisma.matchParticipant.findMany({
        where: {
          userId: user.id,
        },
        include: {
          match: {
            include: {
              participants: {
                orderBy: { slot: 'asc' },
                select: {
                  slot: true,
                  team: true,
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
            },
          },
        },
        orderBy: {
          match: {
            playedAt: 'desc',
          },
        },
        take: 10,
      }),
    ]);

    const wins = profile.wins;
    const winRate =
      matchesPlayed > 0
        ? Number(((wins / matchesPlayed) * 100).toFixed(2))
        : 0;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      photoUrl: profile.photoUrl,
      experiencePoints: profile.experiencePoints,
      category: profile.category,
      preferredClub: profile.preferredClub,
      experienceLevel: profile.experienceLevel,
      rankingPosition: profile.rankingPosition,
      matchesPlayed,
      wins,
      winRate,
      weeklyStreak: profile.weeklyStreak,
      friendsCount: profile.friendsCount,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      socialNotificationsCount: profile.socialNotificationsCount,
      isCurrentUser: user.id === viewerUserId,
      matchHistory: recentParticipations.map((participation) =>
        this.mapMatchHistoryItem(participation),
      ),
    };
  }

  private async ensureProfile(user: UserWithProfile) {
    if (user.profile) {
      return user.profile;
    }

    return this.prisma.profile.create({
      data: { userId: user.id },
    });
  }

  private mapMatchHistoryItem(participation: MatchParticipantWithMatch) {
    const selfTeam = participation.team;
    const teammates = participation.match.participants.filter(
      (item) => item.team === selfTeam && item.user.id !== participation.userId,
    );
    const opponents = participation.match.participants.filter(
      (item) => item.team !== selfTeam,
    );

    const teammateNames = teammates.map((item) => item.user.name).join(' / ');
    const opponentNames = opponents.map((item) => item.user.name).join(' / ');
    const didWin =
      participation.match.status === MatchStatus.COMPLETED &&
      participation.match.winnerTeam !== null
        ? participation.match.winnerTeam === selfTeam
        : null;

    return {
      id: participation.match.id,
      clubName: participation.match.clubName,
      playedAt: participation.match.playedAt,
      matchType: participation.match.matchType,
      status: participation.match.status,
      winnerTeam: participation.match.winnerTeam,
      result: didWin == null ? 'PENDING' : didWin ? 'WIN' : 'LOSS',
      title:
        didWin == null
          ? `Partido en ${participation.match.clubName}`
          : didWin
            ? `Ganaste vs ${opponentNames || 'rivales'}`
            : `Perdiste vs ${opponentNames || 'rivales'}`,
      subtitle: teammateNames
        ? `Con ${teammateNames}`
        : participation.match.clubName,
      xpDelta: didWin == null ? 0 : didWin ? 40 : -20,
      participants: participation.match.participants.map((item) => ({
        slot: item.slot,
        team: item.team,
        user: item.user,
      })),
    };
  }
}
