import { Injectable } from '@nestjs/common';
import type { StringValue } from 'ms';

export type AdminCookieSameSite = 'lax' | 'strict' | 'none';

@Injectable()
export class AdminConfig {
  get jwtSecret() {
    const value = process.env.ADMIN_JWT_SECRET;
    if (!value || value.length < 32) {
      throw new Error('ADMIN_JWT_SECRET must be at least 32 characters');
    }
    if (value === process.env.JWT_SECRET) {
      throw new Error('ADMIN_JWT_SECRET must not reuse JWT_SECRET');
    }
    return value;
  }

  get jwtExpiresIn(): StringValue {
    return (process.env.ADMIN_JWT_EXPIRES_IN ?? '15m') as StringValue;
  }

  get refreshTtlDays() {
    return this.number('ADMIN_REFRESH_TOKEN_TTL_DAYS', 30);
  }

  get cookieName() {
    return process.env.ADMIN_COOKIE_NAME || 'pgo_admin_refresh';
  }

  get cookieDomain() {
    return process.env.ADMIN_COOKIE_DOMAIN || undefined;
  }

  get cookieSecure() {
    return (process.env.ADMIN_COOKIE_SECURE ?? '').toLowerCase() === 'true';
  }

  get cookieSameSite(): AdminCookieSameSite {
    const value = (process.env.ADMIN_COOKIE_SAME_SITE ?? 'lax').toLowerCase();
    return value === 'strict' || value === 'none' ? value : 'lax';
  }

  get allowedOrigins() {
    return (process.env.ADMIN_ALLOWED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get maxLoginAttempts() {
    return this.number('ADMIN_LOGIN_MAX_ATTEMPTS', 5);
  }

  get lockMinutes() {
    return this.number('ADMIN_LOGIN_LOCK_MINUTES', 15);
  }

  private number(key: string, fallback: number) {
    const value = Number(process.env[key] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
