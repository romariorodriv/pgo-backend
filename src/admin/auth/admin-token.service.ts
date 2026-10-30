import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import type { AdminJwtPayload } from './admin-auth.types';
import { AdminConfig } from '../common/admin-config';

@Injectable()
export class AdminTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AdminConfig,
  ) {}

  signAccessToken(payload: AdminJwtPayload) {
    return this.jwt.signAsync(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.jwtExpiresIn,
    });
  }

  generateRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
