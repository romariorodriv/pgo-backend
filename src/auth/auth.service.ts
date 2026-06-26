import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EmailService } from './email.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { validatePasswordOrThrow } from './password-rules';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private static readonly passwordResetMessage =
    'Si el correo esta registrado, recibiras instrucciones para restablecer tu contrasena.';
  private static readonly passwordResetTtlMs = 30 * 60 * 1000;
  private static readonly refreshTtlMs = 30 * 24 * 60 * 60 * 1000;
  private readonly googleClient = new OAuth2Client();
  private readonly googleClientIds: string[];

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {
    const rawClientIds =
      this.configService.get<string>('GOOGLE_CLIENT_IDS') ??
      this.configService.get<string>('GOOGLE_CLIENT_ID') ??
      '';

    this.googleClientIds = rawClientIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async register(registerDto: RegisterDto) {
    const normalizedEmail = registerDto.email.toLowerCase().trim();
    const password = validatePasswordOrThrow(registerDto.password);
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new BadRequestException('El correo ya esta registrado');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let user;

    try {
      user = await this.usersService.create({
        name: registerDto.name.trim(),
        email: normalizedEmail,
        passwordHash,
        profile: {
          create: {},
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('El correo ya esta registrado');
      }

      throw error;
    }

    const tokens = await this.buildTokens(user.id, user.email);

    return {
      message: 'Usuario registrado correctamente',
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const normalizedEmail = loginDto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('No se pudo validar la cuenta de Google');
    }

    const tokens = await this.buildTokens(user.id, user.email);

    return {
      message: 'Login exitoso',
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async googleLogin(googleLoginDto: GoogleLoginDto) {
    if (this.googleClientIds.length === 0) {
      throw new InternalServerErrorException(
        'Google Sign-In no esta configurado en el backend',
      );
    }

    console.info(
      `auth_google received token=${googleLoginDto.idToken ? 'yes' : 'no'} audiences=${this.googleClientIds.length}`,
    );

    let payload;

    try {
      console.info('auth_google verify_start');
      const ticket = await this.googleClient.verifyIdToken({
        idToken: googleLoginDto.idToken,
        audience: this.googleClientIds,
      });

      payload = ticket.getPayload();
      console.info(
        `auth_google verify_ok sub_present=${Boolean(payload?.sub)} email_domain=${this.emailDomain(payload?.email)}`,
      );
    } catch {
      console.info('auth_google verify_failed');
      throw new UnauthorizedException('No se pudo validar la cuenta de Google');
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException(
        'La cuenta de Google no tiene un correo verificado',
      );
    }

    const normalizedEmail = payload.email.toLowerCase().trim();
    let user = await this.usersService.findByGoogleId(payload.sub);

    if (!user) {
      const existingUser = await this.usersService.findByEmail(normalizedEmail);

      if (existingUser) {
        console.info(
          `auth_google link_existing email_domain=${this.emailDomain(normalizedEmail)}`,
        );
        user = await this.usersService.updateById(existingUser.id, {
          googleId: payload.sub,
        } as unknown as Prisma.UserUpdateInput);
      } else {
        console.info(
          `auth_google create_new email_domain=${this.emailDomain(normalizedEmail)}`,
        );
        const passwordHash = await bcrypt.hash(randomUUID(), 10);

        try {
          user = await this.usersService.create({
            name: (payload.name ?? normalizedEmail.split('@').first).trim(),
            email: normalizedEmail,
            googleId: payload.sub,
            passwordHash,
            profile: {
              create: {
                photoUrl: payload.picture ?? undefined,
              },
            },
          } as unknown as Prisma.UserCreateInput);
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new BadRequestException(
              'No se pudo completar el login con Google',
            );
          }

          throw error;
        }
      }
    }

    const tokens = await this.buildTokens(user.id, user.email);
    console.info('auth_google jwt_issued');

    return {
      message: 'Login con Google exitoso',
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  private emailDomain(email?: string) {
    const separator = email?.lastIndexOf('@') ?? -1;
    return separator >= 0 ? email!.slice(separator + 1) : 'unknown';
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user || !user.isActive) {
      return { message: AuthService.passwordResetMessage };
    }

    const resetToken = this.generateOpaqueToken();
    const tokenHash = this.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + AuthService.passwordResetTtlMs);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    await this.emailService.sendPasswordReset(user.email, resetToken);

    return {
      message: AuthService.passwordResetMessage,
    };
  }

  async resetPassword(token: string, password?: string) {
    const nextPassword = validatePasswordOrThrow(password);
    const tokenHash = this.hashToken(token);
    const passwordHash = await bcrypt.hash(nextPassword, 10);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() <= Date.now() ||
      !resetToken.user.isActive
    ) {
      throw new BadRequestException(
        'El codigo ingresado no es valido o vencio',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Tu contrasena fue actualizada correctamente' };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, password?: string) {
    const nextPassword = validatePasswordOrThrow(password);

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Contrasena actualizada correctamente' };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() <= Date.now() ||
      !stored.user.isActive
    ) {
      throw new UnauthorizedException('Sesion expirada');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.buildTokens(stored.user.id, stored.user.email);

    return {
      message: 'Sesion actualizada',
      user: this.sanitizeUser(stored.user),
      ...tokens,
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Sesion cerrada correctamente' };
  }

  async deleteAccount(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    const deletedEmail = `deleted-${userId}@pgo.local`;
    const passwordHash = await bcrypt.hash(randomUUID(), 10);

    await this.prisma.$transaction([
      this.prisma.pushDeviceToken.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.appNotification.deleteMany({ where: { userId } }),
      this.prisma.profile.updateMany({
        where: { userId },
        data: {
          photoUrl: null,
          category: null,
          preferredClub: null,
          preferredSide: null,
          racketModel: null,
          experienceLevel: null,
          rankingPosition: 0,
          wins: 0,
          weeklyStreak: 0,
          friendsCount: 0,
          followersCount: 0,
          followingCount: 0,
          socialNotificationsCount: 0,
        },
      }),
      this.prisma.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: userId },
            { addresseeId: userId },
            { userAId: userId },
            { userBId: userId },
          ],
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: 'Usuario eliminado',
          email: deletedEmail,
          googleId: null,
          passwordHash,
        },
      }),
    ]);

    return { message: 'Cuenta eliminada correctamente' };
  }

  private sanitizeUser(user: { id: string; name: string; email: string }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }

  private async buildTokens(userId: string, email: string) {
    const payload: JwtPayload = {
      sub: userId,
      email,
    };

    const refreshToken = this.generateOpaqueToken();
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + AuthService.refreshTtlMs),
      },
    });

    return {
      accessToken: await this.jwtService.signAsync(payload),
      refreshToken,
    };
  }

  private generateOpaqueToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
