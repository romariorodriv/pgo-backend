import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminStatus } from '@prisma/client';
import { AdminConfig } from '../common/admin-config';
import { adminUnauthorized } from '../common/admin-errors';
import { AdminAuthRepository } from './admin-auth.repository';
import type { AdminJwtPayload } from './admin-auth.types';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    config: AdminConfig,
    private readonly repository: AdminAuthRepository,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  async validate(payload: AdminJwtPayload) {
    if (payload.subjectType !== 'ADMIN' || !payload.role) {
      throw adminUnauthorized();
    }
    const admin = await this.repository.findActiveById(payload.sub);
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw adminUnauthorized();
    }
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      status: admin.status,
    };
  }
}
