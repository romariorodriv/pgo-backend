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

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();
  private readonly googleClientIds: string[];

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    let payload;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: googleLoginDto.idToken,
        audience: this.googleClientIds,
      });

      payload = ticket.getPayload();
    } catch {
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
        user = await this.usersService.updateById(
          existingUser.id,
          {
            googleId: payload.sub,
          } as unknown as Prisma.UserUpdateInput,
        );
      } else {
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

    return {
      message: 'Login con Google exitoso',
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: {
    id: string;
    name: string;
    email: string;
  }) {
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
