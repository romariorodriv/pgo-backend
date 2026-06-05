import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FriendshipStatus,
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
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    return this.buildProfileResponse(userId, userId);
  }

  async getProfileById(profileUserId: string, viewerUserId: string) {
    return this.buildProfileResponse(profileUserId, viewerUserId);
  }

  async getMyHistory(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const profile = await this.ensureProfile(user);
    const history = await this.getMatchHistory(user.id);
    const matchesPlayed = history.length;
    const wins = profile.wins;
    const losses = history.filter((item) => item.result === 'LOSS').length;
    const winRate =
      matchesPlayed > 0 ? Number(((wins / matchesPlayed) * 100).toFixed(2)) : 0;

    return {
      matchesPlayed,
      wins,
      losses,
      winRate,
      history,
    };
  }

  async updateMyProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const { name, allowMatchInvites, ...profileData } = updateProfileDto;
    this.logger.debug(
      `updateMyProfile userId=${userId} fields=${Object.keys(updateProfileDto).join(',')}`,
    );
    const trimmedName = name?.trim();
    const currentProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    const profileUpdateData = {
      ...profileData,
      ...(profileData.categoryQuizAnswers !== undefined
        ? {
            categoryQuizAnswers:
              profileData.categoryQuizAnswers as Prisma.InputJsonValue,
          }
        : {}),
    } as Prisma.ProfileUncheckedUpdateInput;
    const mergedProfileState = {
      category: profileData.category ?? currentProfile?.category ?? null,
      categoryOrigin:
        profileData.categoryOrigin ?? currentProfile?.categoryOrigin ?? null,
      categoryIsProvisional:
        profileData.categoryIsProvisional ??
        currentProfile?.categoryIsProvisional ??
        false,
      categorySuggested:
        profileData.categorySuggested ??
        currentProfile?.categorySuggested ??
        null,
      categoryPreliminary:
        profileData.categoryPreliminary ??
        currentProfile?.categoryPreliminary ??
        null,
      categoryMaxApplied:
        profileData.categoryMaxApplied ??
        currentProfile?.categoryMaxApplied ??
        null,
      categoryScore:
        profileData.categoryScore ?? currentProfile?.categoryScore ?? null,
      categoryQuizAnswers:
        profileData.categoryQuizAnswers ??
        currentProfile?.categoryQuizAnswers ??
        null,
      hasCompletedInitialOnboarding:
        profileData.hasCompletedInitialOnboarding ??
        currentProfile?.hasCompletedInitialOnboarding ??
        false,
    };

    if (
      mergedProfileState.hasCompletedInitialOnboarding &&
      !this.hasEnoughInitialCategoryEvidence(mergedProfileState)
    ) {
      this.logger.warn(
        `updateMyProfile validation_failed userId=${userId} fields=${Object.keys(profileData).join(',')}`,
      );
      throw new BadRequestException(
        'No se puede marcar onboarding completado sin categoria o datos del quiz.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (trimmedName || allowMatchInvites !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(trimmedName ? { name: trimmedName } : {}),
            ...(allowMatchInvites !== undefined ? { allowMatchInvites } : {}),
          },
        });
      }

      if (Object.keys(profileUpdateData).length > 0) {
        await tx.profile.upsert({
          where: { userId },
          create: {
            userId,
            ...profileUpdateData,
          } as Prisma.ProfileUncheckedCreateInput,
          update: profileUpdateData,
        });
      }
    });

    return this.getMyProfile(userId);
  }

  private hasEnoughInitialCategoryEvidence(state: {
    category: string | null;
    categoryOrigin: string | null;
    categoryIsProvisional: boolean;
    categorySuggested: string | null;
    categoryPreliminary: string | null;
    categoryMaxApplied: string | null;
    categoryScore: number | null;
    categoryQuizAnswers: unknown;
  }) {
    if ((state.category ?? '').trim().length > 0) return true;

    const origin = (state.categoryOrigin ?? '').trim().toLowerCase();
    if (origin === 'quiz' || origin === 'manual' || origin === 'confirmed') {
      return true;
    }

    if (state.categoryIsProvisional) return true;
    if ((state.categorySuggested ?? '').trim().length > 0) return true;
    if ((state.categoryPreliminary ?? '').trim().length > 0) return true;
    if ((state.categoryMaxApplied ?? '').trim().length > 0) return true;
    if (state.categoryScore !== null && state.categoryScore !== undefined) {
      return true;
    }
    if (this.hasQuizAnswers(state.categoryQuizAnswers)) {
      return true;
    }

    return false;
  }

  private hasQuizAnswers(value: unknown) {
    if (!value || typeof value !== 'object') {
      return false;
    }

    return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
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

    const [
      matchesPlayed,
      recentHistory,
      friendsCount,
      socialNotificationsCount,
    ] = await Promise.all([
      this.prisma.matchParticipant.count({
        where: {
          userId: user.id,
        },
      }),
      this.getMatchHistory(user.id, 10),
      this.prisma.friendship.count({
        where: {
          status: FriendshipStatus.ACCEPTED,
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
      }),
      this.prisma.friendship.count({
        where: {
          addresseeId: user.id,
          status: FriendshipStatus.PENDING,
        },
      }),
    ]);

    const wins = profile.wins;
    const winRate =
      matchesPlayed > 0 ? Number(((wins / matchesPlayed) * 100).toFixed(2)) : 0;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      photoUrl: profile.photoUrl,
      experiencePoints: profile.experiencePoints,
      category: profile.category,
      preferredClub: profile.preferredClub,
      preferredSide: profile.preferredSide,
      racketModel: profile.racketModel,
      experienceLevel: profile.experienceLevel,
      rankingPosition: profile.rankingPosition,
      matchesPlayed,
      wins,
      winRate,
      weeklyStreak: profile.weeklyStreak,
      friendsCount,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      socialNotificationsCount,
      hasSeenHomeGuide: profile.hasSeenHomeGuide,
      hasCompletedInitialOnboarding: profile.hasCompletedInitialOnboarding,
      categorySuggested: profile.categorySuggested,
      categoryPreliminary: profile.categoryPreliminary,
      categoryMaxApplied: profile.categoryMaxApplied,
      categoryScore: profile.categoryScore,
      categoryQuizAnswers: profile.categoryQuizAnswers,
      categoryIsProvisional: profile.categoryIsProvisional,
      categoryOrigin: profile.categoryOrigin,
      allowMatchInvites: user.allowMatchInvites,
      isCurrentUser: user.id === viewerUserId,
      matchHistory: recentHistory,
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

  private async getMatchHistory(userId: string, take?: number) {
    const participations = await this.prisma.matchParticipant.findMany({
      where: {
        userId,
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
      ...(take ? { take } : {}),
    });

    return participations.map((participation) =>
      this.mapMatchHistoryItem(participation),
    );
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
