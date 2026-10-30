import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminConfig } from '../common/admin-config';

@Injectable()
export class AdminCookieService {
  constructor(private readonly config: AdminConfig) {}

  readRefreshCookie(request: Request) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';').map((part) => part.trim());
    const prefix = `${this.config.cookieName}=`;
    const match = cookies.find((cookie) => cookie.startsWith(prefix));
    return match ? decodeURIComponent(match.slice(prefix.length)) : null;
  }

  setRefreshCookie(response: Response, token: string) {
    const parts = [
      `${this.config.cookieName}=${encodeURIComponent(token)}`,
      'HttpOnly',
      `Path=/api/admin/auth`,
      `SameSite=${this.config.cookieSameSite}`,
      `Max-Age=${this.config.refreshTtlDays * 24 * 60 * 60}`,
    ];
    if (this.config.cookieSecure) parts.push('Secure');
    if (this.config.cookieDomain)
      parts.push(`Domain=${this.config.cookieDomain}`);
    response.setHeader('Set-Cookie', parts.join('; '));
  }

  clearRefreshCookie(response: Response) {
    const parts = [
      `${this.config.cookieName}=`,
      'HttpOnly',
      'Path=/api/admin/auth',
      `SameSite=${this.config.cookieSameSite}`,
      'Max-Age=0',
    ];
    if (this.config.cookieSecure) parts.push('Secure');
    if (this.config.cookieDomain)
      parts.push(`Domain=${this.config.cookieDomain}`);
    response.setHeader('Set-Cookie', parts.join('; '));
  }
}
