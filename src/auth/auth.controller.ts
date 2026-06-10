import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('google')
  googleLogin(@Body() googleLoginDto: GoogleLoginDto) {
    return this.authService.googleLogin(googleLoginDto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: { email?: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: { id?: string }) {
    if (!user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(
    @CurrentUser() user: { id?: string },
    @Body() body: { password?: string },
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return this.authService.changePassword(user.id, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  deleteAccount(@CurrentUser() user: { id?: string }) {
    if (!user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return this.authService.deleteAccount(user.id);
  }
}
