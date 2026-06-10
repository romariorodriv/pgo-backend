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
import { randomUUID } from 'crypto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();
  private readonly googleClientIds: string[];

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new BadRequestException('El correo ya esta registrado');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);
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

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invalidas');
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
      console.info(
        `auth_google verify audience=${this.googleClientIds.join(',')}`,
      );
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
    console.info(`auth_google jwt_issued userId=${user.id}`);

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

  async forgotPassword(email?: string) {
    const normalizedEmail = email?.toLowerCase().trim() ?? '';
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new BadRequestException('Ingresa un correo valido');
    }

    return {
      message:
        'Si el correo existe, enviaremos instrucciones para recuperar tu clave.',
    };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, password?: string) {
    const nextPassword = password?.trim() ?? '';

    if (
      nextPassword.length < 8 ||
      !/\d/.test(nextPassword) ||
      !/[A-Z]/.test(nextPassword)
    ) {
      throw new BadRequestException(
        'La contrasena debe tener 8 caracteres, 1 numero y 1 mayuscula',
      );
    }

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    await this.usersService.updateById(userId, { passwordHash });

    return { message: 'Contrasena actualizada correctamente' };
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

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
