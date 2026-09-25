import { Body, Controller, ForbiddenException, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth/web')
export class WebAuthController {
  private readonly cookieName: string;
  private readonly secure: boolean;
  private readonly domain?: string;
  private readonly allowedOrigins: string[];

  constructor(private readonly auth: AuthService, config: ConfigService) {
    this.cookieName = config.get('WEB_REFRESH_COOKIE_NAME') ?? 'pgo_web_refresh';
    this.secure = (config.get('NODE_ENV') ?? '').toLowerCase() === 'production';
    this.domain = config.get('WEB_COOKIE_DOMAIN') || undefined;
    this.allowedOrigins = String(config.get('CORS_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!this.secure && this.allowedOrigins.length === 0) this.allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertWebRequest(req);
    return this.respond(res, await this.auth.login(dto));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertWebRequest(req);
    return this.respond(res, await this.auth.register(dto));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertWebRequest(req);
    const result = await this.auth.refresh(this.readCookie(req) ?? '');
    return this.respond(res, result);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertWebRequest(req);
    await this.auth.logout(this.readCookie(req) ?? undefined);
    this.clearCookie(res);
    return { ok: true };
  }

  private respond(response: Response, result: { accessToken: string; refreshToken: string; user: unknown }) {
    this.setCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  private assertWebRequest(request: Request) {
    const origin = request.headers.origin;
    if (request.headers['x-pgo-web-request'] !== '1' || !origin || !this.allowedOrigins.includes(origin)) throw new ForbiddenException({ code: 'WEB_CSRF_REJECTED', message: 'Solicitud web no permitida' });
  }

  private readCookie(request: Request) {
    const prefix = `${this.cookieName}=`;
    return request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
  }

  private setCookie(response: Response, token: string) {
    const parts = [`${this.cookieName}=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/api/auth/web', 'SameSite=Lax', `Max-Age=${30 * 24 * 60 * 60}`];
    if (this.secure) parts.push('Secure');
    if (this.domain) parts.push(`Domain=${this.domain}`);
    response.setHeader('Set-Cookie', parts.join('; '));
  }

  private clearCookie(response: Response) {
    const parts = [`${this.cookieName}=`, 'HttpOnly', 'Path=/api/auth/web', 'SameSite=Lax', 'Max-Age=0'];
    if (this.secure) parts.push('Secure');
    if (this.domain) parts.push(`Domain=${this.domain}`);
    response.setHeader('Set-Cookie', parts.join('; '));
  }
}
