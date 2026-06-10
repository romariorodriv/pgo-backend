import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
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

  async updateMyProfile(
    userId: string | undefined,
    updateProfileDto: UpdateProfileDto,
    requestId = 'untracked',
  ) {
    if (!userId) {
      this.logger.warn(
        `profile_update requestId=${requestId} userId_present=false endpoint=PATCH_/profile/me`,
      );
      throw new NotFoundException({
        code: 'user_not_found',
        message: 'Usuario no encontrado',
        requestId,
      });
    }

    const { name, allowMatchInvites, photoUrl, ...rawProfileData } =
      updateProfileDto as any;
    this.logger.log(
      `profile_update requestId=${requestId} userId_present=true endpoint=PATCH_/profile/me ${this.summarizePayload(updateProfileDto)}`,
    );
    const trimmedName = name?.trim();
    const normalizedPhotoUrl = this.normalizePhotoUrl(photoUrl);
    if (photoUrl !== undefined && normalizedPhotoUrl === undefined) {
      this.logger.warn(
        `profile_update_photo_ignored requestId=${requestId} type=${typeof photoUrl} length=${typeof photoUrl === 'string' ? photoUrl.length : 0}`,
      );
    }
    const profileData = this.removeUndefined({
      ...rawProfileData,
      ...(normalizedPhotoUrl !== undefined
        ? { photoUrl: normalizedPhotoUrl }
        : {}),
    }) as any;
    try {
      const userExists = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!userExists) {
        throw new NotFoundException({
          code: 'user_not_found',
          message: 'Usuario no encontrado',
          requestId,
        });
      }

      const currentProfile = (await this.prisma.profile.findUnique({
        where: { userId },
      })) as any;
      const profileUpdateData = {
        ...profileData,
        ...(profileData.categoryQuizAnswers !== undefined
          ? {
              categoryQuizAnswers:
                profileData.categoryQuizAnswers as Prisma.InputJsonValue,
            }
          : {}),
      } as any;
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
        throw new BadRequestException({
          code: 'invalid_profile_payload',
          message:
            'No se puede marcar onboarding completado sin categoria o datos del quiz.',
          requestId,
        });
      }

      await this.prisma.$transaction(async (tx) => {
        if (trimmedName || allowMatchInvites !== undefined) {
          await tx.user.update({
            where: { id: userId },
            data: {
              ...(trimmedName ? { name: trimmedName } : {}),
              ...(allowMatchInvites !== undefined ? { allowMatchInvites } : {}),
            } as any,
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

      this.logger.log(`profile_update_success requestId=${requestId}`);
      return this.getMyProfile(userId);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logProfileUpdateError(error, requestId);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException({
            code: 'profile_conflict',
            message: 'El perfil tiene datos que entran en conflicto.',
            requestId,
          });
        }
        if (error.code === 'P2003' || error.code === 'P2025') {
          throw new NotFoundException({
            code: 'user_not_found',
            message: 'Usuario no encontrado',
            requestId,
          });
        }
      }
      if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException({
          code: 'invalid_profile_payload',
          message:
            'El servidor no pudo validar los campos enviados para el perfil.',
          requestId,
        });
      }

      throw new InternalServerErrorException({
        code: 'profile_update_failed',
        message: 'No se pudo actualizar el perfil.',
        requestId,
      });
    }
  }

  private summarizePayload(payload: object) {
    const fields = Object.keys(payload).sort().join(',');
    const types = Object.entries(payload)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        const type = Array.isArray(value)
          ? 'array'
          : value === null
            ? 'null'
            : typeof value;
        const length = typeof value === 'string' ? `:${value.length}` : '';
        return `${key}=${type}${length}`;
      })
      .join(',');
    return `fields=${fields} types=${types}`;
  }

  private removeUndefined<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as Partial<T>;
  }

  private normalizePhotoUrl(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 2048) return undefined;
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? trimmed
        : undefined;
    } catch {
      return undefined;
    }
  }

  private logProfileUpdateError(error: unknown, requestId: string) {
    if (error instanceof Prisma.PrismaClientValidationError) {
      const message = error.message.replace(/\s+/g, ' ').slice(0, 300);
      this.logger.error(
        `profile_update_failed requestId=${requestId} prisma_validation=true message=${message}`,
        error.stack,
      );
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = JSON.stringify(error.meta ?? {}).slice(0, 500);
      const message = error.message.replace(/\s+/g, ' ').slice(0, 300);
      this.logger.error(
        `profile_update_failed requestId=${requestId} prisma_code=${error.code} meta=${meta} message=${message}`,
        error.stack,
      );
      return;
    }

    const typedError = error as Error;
    const type = typedError?.constructor?.name ?? typeof error;
    const message = (typedError?.message ?? String(error))
      .replace(/\s+/g, ' ')
      .slice(0, 300);
    this.logger.error(
      `profile_update_failed requestId=${requestId} type=${type} message=${message}`,
      typedError?.stack,
    );
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

    return Array.isArray(value)
      ? value.length > 0
      : Object.keys(value).length > 0;
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

    const profile = (await this.ensureProfile(user)) as any;

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
      allowMatchInvites: (user as any).allowMatchInvites,
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
