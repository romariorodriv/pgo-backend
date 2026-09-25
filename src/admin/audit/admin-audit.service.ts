import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminAuditRepository } from './admin-audit.repository';

const forbiddenKeys = [
  'password',
  'token',
  'cookie',
  'authorization',
  'refreshToken',
];

@Injectable()
export class AdminAuditService {
  constructor(private readonly repository: AdminAuditRepository) {}

  async log(data: {
    adminUserId?: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.repository.create({
      ...data,
      metadata: data.metadata ? this.sanitize(data.metadata) : undefined,
    });
  }

  private sanitize(value: Record<string, unknown>): Prisma.InputJsonValue {
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !forbiddenKeys.includes(key.toLowerCase()),
      ),
    ) as Prisma.InputJsonValue;
  }
}
