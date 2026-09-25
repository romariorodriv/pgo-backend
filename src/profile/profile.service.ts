import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import {
  FriendshipStatus,
  MatchParticipant,
  MatchStatus,
  Prisma,
  Profile,
  TournamentMatchStatus,
  TournamentRegistrationMode,
  TournamentRegistrationStatus,
  User,
} from '@prisma/client';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadProfilePhotoDto } from './dto/upload-profile-photo.dto';

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
  private firebaseApp?: App;

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

  async uploadMyProfilePhoto(
    userId: string | undefined,
    uploadProfilePhotoDto: UploadProfilePhotoDto,
    requestId = 'untracked',
  ) {
    if (!userId) {
      throw new NotFoundException({
        code: 'user_not_found',
        message: 'Usuario no encontrado',
        requestId,
      });
    }

    const image = this.parseProfilePhotoDataUrl(uploadProfilePhotoDto.dataUrl);
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

    try {
      const bucket = this.getFirebaseStorageBucket();
      const token = randomUUID();
      const extension = this.extensionForContentType(image.contentType);
      const objectName = `profile-photos/${userId}/${Date.now()}-${token}.${extension}`;
      const file = bucket.file(objectName);
      await file.save(image.buffer, {
        contentType: image.contentType,
        resumable: false,
        metadata: {
          cacheControl: 'public, max-age=31536000',
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      const encodedObjectName = encodeURIComponent(objectName);
      const photoUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
        `/o/${encodedObjectName}?alt=media&token=${token}`;

      await this.prisma.profile.upsert({
        where: { userId },
        create: { userId, photoUrl },
        update: { photoUrl },
      });

      return this.getMyProfile(userId);
    } catch (error) {
      this.logProfileUpdateError(error, requestId);
      return this.storeProfilePhotoDataUrl(userId, image, requestId);
    }
  }

  async removeMyProfilePhoto(
    userId: string | undefined,
    requestId = 'untracked',
  ) {
    if (!userId) {
      throw new NotFoundException({
        code: 'user_not_found',
        message: 'Usuario no encontrado',
        requestId,
      });
    }

    try {
      await this.prisma.profile.upsert({
        where: { userId },
        create: { userId, photoUrl: null },
        update: { photoUrl: null },
      });
      return this.getMyProfile(userId);
    } catch (error) {
      this.logProfileUpdateError(error, requestId);
      throw new InternalServerErrorException({
        code: 'profile_photo_remove_failed',
        message: 'No se pudo quitar la foto de perfil.',
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

  private parseProfilePhotoDataUrl(dataUrl: string) {
    const match = dataUrl.match(
      /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/,
    );
    if (!match) {
      throw new BadRequestException({
        code: 'invalid_profile_photo',
        message: 'La foto debe ser una imagen JPG, PNG o WebP.',
      });
    }

    const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (buffer.length < 1024 || buffer.length > 1_000_000) {
      throw new BadRequestException({
        code: 'invalid_profile_photo_size',
        message: 'La foto debe pesar menos de 1 MB.',
      });
    }

    return { contentType, buffer };
  }

  private extensionForContentType(contentType: string) {
    switch (contentType) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'jpg';
    }
  }

  private async storeProfilePhotoDataUrl(
    userId: string,
    image: { contentType: string; buffer: Buffer },
    requestId: string,
  ) {
    try {
      const photoUrl = `data:${image.contentType};base64,${image.buffer.toString('base64')}`;
      await this.prisma.profile.upsert({
        where: { userId },
        create: { userId, photoUrl },
        update: { photoUrl },
      });
      this.logger.warn(
        `profile_photo_upload_fallback requestId=${requestId} storage=firebase_unavailable`,
      );
      return this.getMyProfile(userId);
    } catch (fallbackError) {
      this.logProfileUpdateError(fallbackError, requestId);
      throw new InternalServerErrorException({
        code: 'profile_photo_upload_failed',
        message: 'No se pudo actualizar la foto de perfil.',
        requestId,
      });
    }
  }

  private getFirebaseStorageBucket() {
    const app = this.getFirebaseApp();
    const bucketName = this.resolveFirebaseStorageBucketName();
    return getStorage(app).bucket(bucketName);
  }

  private getFirebaseApp() {
    if (this.firebaseApp) return this.firebaseApp;

    const existing = getApps()[0];
    if (existing) {
      this.firebaseApp = existing;
      return existing;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const credentials = serviceAccountJson
      ? JSON.parse(serviceAccountJson)
      : serviceAccountPath
        ? JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
        : undefined;

    if (!credentials) {
      throw new Error('Firebase service account is not configured');
    }

    this.firebaseApp = initializeApp({
      credential: cert(credentials),
      storageBucket: this.resolveFirebaseStorageBucketName(
        credentials.project_id,
      ),
    });
    return this.firebaseApp;
  }

  private resolveFirebaseStorageBucketName(projectId?: string) {
    const configured = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    if (configured) return configured;
    const resolvedProjectId =
      projectId?.trim() || process.env.FIREBASE_PROJECT_ID?.trim();
    if (!resolvedProjectId) {
      throw new Error('Firebase storage bucket is not configured');
    }
    return `${resolvedProjectId}.firebasestorage.app`;
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

    const regularHistory = participations.map((participation) =>
      this.mapMatchHistoryItem(participation),
    );

    const tournamentHistory = await this.getTournamentMatchHistory(userId);
    const history = [...regularHistory, ...tournamentHistory].sort(
      (left, right) =>
        new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime(),
    );

    return take ? history.slice(0, take) : history;
  }

  private async getTournamentMatchHistory(userId: string) {
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        status: TournamentRegistrationStatus.CONFIRMED,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        partnerUserId: { not: null },
        OR: [{ userId }, { partnerUserId: userId }],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profile: { select: { photoUrl: true, category: true } },
          },
        },
        partnerUser: {
          select: {
            id: true,
            name: true,
            profile: { select: { photoUrl: true, category: true } },
          },
        },
        tournament: {
          include: {
            registrations: {
              where: {
                status: TournamentRegistrationStatus.CONFIRMED,
                mode: TournamentRegistrationMode.WITH_PARTNER,
                partnerUserId: { not: null },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    profile: { select: { photoUrl: true, category: true } },
                  },
                },
                partnerUser: {
                  select: {
                    id: true,
                    name: true,
                    profile: { select: { photoUrl: true, category: true } },
                  },
                },
              },
            },
            matches: {
              where: { status: TournamentMatchStatus.FINISHED },
            },
          },
        },
      },
    });

    return registrations.flatMap((registration) => {
      const teamLabel =
        `${registration.user.name} / ${registration.partnerUser!.name}`.trim();
      const teamByLabel = new Map(
        registration.tournament.registrations.map((item) => [
          `${item.user.name} / ${item.partnerUser!.name}`.trim(),
          item,
        ]),
      );

      return registration.tournament.matches
        .filter(
          (match) =>
            match.teamOneLabel.trim() === teamLabel ||
            match.teamTwoLabel.trim() === teamLabel,
        )
        .map((match) => {
          const selfIsTeamOne = match.teamOneLabel.trim() === teamLabel;
          const winnerTeam =
            match.winnerLabel?.trim() === match.teamOneLabel.trim()
              ? 1
              : match.winnerLabel?.trim() === match.teamTwoLabel.trim()
                ? 2
                : null;
          const didWin =
            winnerTeam != null && winnerTeam === (selfIsTeamOne ? 1 : 2);
          const opponentLabel = selfIsTeamOne
            ? match.teamTwoLabel.trim()
            : match.teamOneLabel.trim();
          const participants = [
            ...this.tournamentHistoryParticipants(
              teamByLabel.get(match.teamOneLabel.trim()),
              match.teamOneLabel,
              1,
              1,
            ),
            ...this.tournamentHistoryParticipants(
              teamByLabel.get(match.teamTwoLabel.trim()),
              match.teamTwoLabel,
              2,
              3,
            ),
          ];

          return {
            id: `tournament:${registration.tournament.id}:${match.id}`,
            tournamentId: registration.tournament.id,
            tournamentMatchId: match.id,
            clubName: registration.tournament.location,
            playedAt: match.scheduledAt,
            matchType: 'TOURNAMENT',
            status: 'COMPLETED',
            winnerTeam,
            games: this.parseTournamentScore(match.score),
            result: didWin ? 'WIN' : 'LOSS',
            title: didWin
              ? `Ganaste vs ${opponentLabel || 'rivales'}`
              : `Perdiste vs ${opponentLabel || 'rivales'}`,
            subtitle: `${registration.tournament.title} - ${this.getTournamentStageLabel(match.stage)}`,
            xpDelta: didWin ? 40 : -20,
            participants,
          };
        });
    });
  }

  private tournamentHistoryParticipants(
    registration:
      | {
          user: {
            id: string;
            name: string;
            profile: {
              photoUrl: string | null;
              category: string | null;
            } | null;
          };
          partnerUser: {
            id: string;
            name: string;
            profile: {
              photoUrl: string | null;
              category: string | null;
            } | null;
          } | null;
        }
      | undefined,
    fallbackLabel: string,
    team: number,
    firstSlot: number,
  ) {
    if (registration?.partnerUser) {
      return [
        {
          slot: firstSlot,
          team,
          user: registration.user,
        },
        {
          slot: firstSlot + 1,
          team,
          user: registration.partnerUser,
        },
      ];
    }

    const names = fallbackLabel
      .split('/')
      .map((item) => item.trim())
      .filter(Boolean);

    return [0, 1].map((index) => ({
      slot: firstSlot + index,
      team,
      user: {
        id: `${fallbackLabel}-${index}`,
        name: names[index] ?? `Jugador ${firstSlot + index}`,
        profile: null,
      },
    }));
  }

  private parseTournamentScore(score: string | null) {
    if (!score?.trim()) return [];
    return [...score.matchAll(/(\d{1,2})\s*[-:]\s*(\d{1,2})/g)].map(
      (match) => ({
        team1: Number(match[1]),
        team2: Number(match[2]),
      }),
    );
  }

  private getTournamentStageLabel(stage: string) {
    if (stage === 'final') return 'Final';
    if (stage.startsWith('juego-')) {
      const number = Number(stage.replace('juego-', ''));
      return Number.isFinite(number) ? `Juego ${number}` : stage;
    }
    return stage;
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
