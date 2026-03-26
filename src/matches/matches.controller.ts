import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { FinalizeMatchDto } from './dto/finalize-match.dto';
import { UpdateMatchResultDto } from './dto/update-match-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: CreateMatchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.matchesService.create(
      user.id,
      body.clubName,
      new Date(body.playedAt),
      body.matchType,
      body.participantIds,
      body.photoUrl,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMyMatches(@CurrentUser() user: AuthenticatedUser) {
    return this.matchesService.findMyMatches(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/result')
  updateResult(
    @Param('id') id: string,
    @Body() body: UpdateMatchResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matchesService.updateResult(
      id,
      user.id,
      new Date(body.playedAt),
      body.winnerTeam,
      body.games,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/finalize')
  finalize(
    @Param('id') id: string,
    @Body() body: FinalizeMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matchesService.finalize(
      id,
      user.id,
      body.winnerPlayerIds,
      body.description,
      body.photoUrl,
    );
  }
}
