import { Injectable } from '@nestjs/common';
import { AdminStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.adminUser.findUnique({ where: { email } });
  }

  findActiveById(id: string) {
    return this.prisma.adminUser.findFirst({
      where: { id, status: AdminStatus.ACTIVE },
    });
  }

  recordFailedLogin(id: string, attempts: number, lockedUntil: Date | null) {
    return this.prisma.adminUser.update({
      where: { id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
  }

  recordSuccessfulLogin(id: string) {
    return this.prisma.adminUser.update({
      where: { id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  }

  createRefreshToken(data: {
    adminUserId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.adminRefreshToken.create({ data });
  }

  findRefreshToken(tokenHash: string) {
    return this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash },
      include: { adminUser: true },
    });
  }

  rotateRefreshToken(
    oldId: string,
    newToken: {
      adminUserId: string;
      tokenHash: string;
      expiresAt: Date;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.adminRefreshToken.create({ data: newToken });
      await tx.adminRefreshToken.update({
        where: { id: oldId },
        data: { revokedAt: new Date(), replacedByTokenId: created.id },
      });
      return created;
    });
  }

  revokeByHash(tokenHash: string) {
    return this.prisma.adminRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAll(adminUserId: string) {
    return this.prisma.adminRefreshToken.updateMany({
      where: { adminUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
