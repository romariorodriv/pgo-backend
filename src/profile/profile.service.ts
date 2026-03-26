import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const profile =
      user.profile ??
      (await this.prisma.profile.create({
        data: { userId: user.id },
      }));

    const [matchesPlayed, recentMatches] = await Promise.all([
      this.prisma.match.count({
        where: {
          createdById: user.id,
        },
      }),
      this.prisma.match.findMany({
        where: {
          createdById: user.id,
        },
        orderBy: { playedAt: 'desc' },
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
      matchHistory: recentMatches,
    };
  }

  async updateMyProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        ...updateProfileDto,
      },
      update: updateProfileDto,
    });

    return this.getMyProfile(userId);
  }
}
