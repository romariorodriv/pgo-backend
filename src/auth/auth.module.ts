import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { EmailService } from './email.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WebAuthController } from './web-auth.controller';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const configuredExpiration =
          configService.get<string>('JWT_EXPIRES_IN') ?? '30d';
        const expiresIn: number | StringValue = /^\d+$/.test(
          configuredExpiration,
        )
          ? Number(configuredExpiration)
          : (configuredExpiration as StringValue);

        return {
          secret: configService.getOrThrow<string>('JWT_SECRET'),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController, WebAuthController],
  providers: [AuthService, JwtStrategy, EmailService],
})
export class AuthModule {}
