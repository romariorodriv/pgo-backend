import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminRole, AdminStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AdminConfig } from '../common/admin-config';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminAuthRepository } from './admin-auth.repository';
import { AdminTokenService } from './admin-token.service';
import type { CurrentAdmin, RequestMeta } from './admin-auth.types';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly repository: AdminAuthRepository,
    private readonly tokens: AdminTokenService,
    private readonly config: AdminConfig,
    private readonly audit: AdminAuditService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta) {
    const normalizedEmail = email.toLowerCase().trim();
    const admin = await this.repository.findByEmail(normalizedEmail);
    const invalid = () => new UnauthorizedException('Credenciales invalidas');

    if (!admin) {
      await this.audit.log({
        action: 'ADMIN_LOGIN_FAILED',
        metadata: { reason: 'invalid_credentials' },
        ...meta,
      });
      throw invalid();
    }
    if (admin.status !== AdminStatus.ACTIVE) {
      await this.audit.log({
        adminUserId: admin.id,
        action: 'ADMIN_LOGIN_FAILED',
        metadata: { reason: 'inactive' },
        ...meta,
      });
      throw invalid();
    }
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      await this.audit.log({
        adminUserId: admin.id,
        action: 'ADMIN_ACCOUNT_LOCKED',
        ...meta,
      });
      throw new HttpException(
        'Cuenta bloqueada temporalmente',
        HttpStatus.LOCKED,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const ok = (await bcrypt.compare(password, admin.passwordHash)) as boolean;
    if (!ok) {
      const attempts = admin.failedLoginAttempts + 1;
      const lockedUntil =
        attempts >= this.config.maxLoginAttempts
          ? new Date(Date.now() + this.config.lockMinutes * 60_000)
          : null;
      await this.repository.recordFailedLogin(admin.id, attempts, lockedUntil);
      await this.audit.log({
        adminUserId: admin.id,
        action: lockedUntil ? 'ADMIN_ACCOUNT_LOCKED' : 'ADMIN_LOGIN_FAILED',
        ...meta,
      });
      throw lockedUntil
        ? new HttpException('Cuenta bloqueada temporalmente', HttpStatus.LOCKED)
        : invalid();
    }

    const updated = await this.repository.recordSuccessfulLogin(admin.id);
    const refreshToken = this.tokens.generateRefreshToken();
    await this.repository.createRefreshToken({
      adminUserId: updated.id,
      tokenHash: this.tokens.hashToken(refreshToken),
      expiresAt: this.refreshExpiresAt(),
      ...meta,
    });
    await this.audit.log({
      adminUserId: updated.id,
      action: 'ADMIN_LOGIN_SUCCESS',
      ...meta,
    });
    return {
      admin: this.toDto(updated),
      accessToken: await this.accessToken(updated),
      refreshToken,
    };
  }

  async refresh(refreshToken: string | null, meta: RequestMeta) {
    if (!refreshToken) throw new UnauthorizedException('Sesion expirada');
    const stored = await this.repository.findRefreshToken(
      this.tokens.hashToken(refreshToken),
    );
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() <= Date.now() ||
      stored.adminUser.status !== AdminStatus.ACTIVE
    ) {
      await this.audit.log({
        adminUserId: stored?.adminUserId,
        action: 'ADMIN_REFRESH_FAILED',
        ...meta,
      });
      throw new UnauthorizedException('Sesion expirada');
    }
    const nextRefreshToken = this.tokens.generateRefreshToken();
    await this.repository.rotateRefreshToken(stored.id, {
      adminUserId: stored.adminUserId,
      tokenHash: this.tokens.hashToken(nextRefreshToken),
      expiresAt: this.refreshExpiresAt(),
      ...meta,
    });
    await this.audit.log({
      adminUserId: stored.adminUserId,
      action: 'ADMIN_REFRESH_SUCCESS',
      ...meta,
    });
    return {
      admin: this.toDto(stored.adminUser),
      accessToken: await this.accessToken(stored.adminUser),
      refreshToken: nextRefreshToken,
    };
  }

  async logout(
    refreshToken: string | null,
    admin: CurrentAdmin | null,
    meta: RequestMeta,
  ) {
    if (refreshToken)
      await this.repository.revokeByHash(this.tokens.hashToken(refreshToken));
    await this.audit.log({
      adminUserId: admin?.id,
      action: 'ADMIN_LOGOUT',
      ...meta,
    });
  }

  async logoutAll(admin: CurrentAdmin, meta: RequestMeta) {
    await this.repository.revokeAll(admin.id);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'ADMIN_LOGOUT_ALL',
      ...meta,
    });
  }

  session(admin: CurrentAdmin) {
    return admin;
  }

  private refreshExpiresAt() {
    return new Date(
      Date.now() + this.config.refreshTtlDays * 24 * 60 * 60 * 1000,
    );
  }

  private accessToken(admin: { id: string; email: string; role: AdminRole }) {
    return this.tokens.signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      subjectType: 'ADMIN',
    });
  }

  private toDto(admin: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    status: AdminStatus;
  }) {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      status: admin.status,
    };
  }
}
