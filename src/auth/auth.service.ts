import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

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
