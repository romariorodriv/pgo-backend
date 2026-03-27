import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('suggestions')
  findSuggestions(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findSuggestedPlayers(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('community')
  searchCommunity(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query = '',
  ) {
    return this.usersService.searchCommunity(user.id, query);
  }
}
