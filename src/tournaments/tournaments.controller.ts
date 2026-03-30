import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { RegisterTournamentPartnerDto } from './dto/register-tournament-partner.dto';
import { RegisterTournamentSoloDto } from './dto/register-tournament-solo.dto';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() body: CreateTournamentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.create(
      user.id,
      body.title,
      body.tournamentType,
      body.playerCapacity,
      body.modality,
      body.format,
      body.location,
      body.address,
      body.city,
      body.district,
      new Date(body.startsAt),
      body.prize,
      body.entryFee,
      body.category,
      body.description,
      body.photoUrl,
      body.status,
    );
  }

  @Get()
  findAll() {
    return this.tournamentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/register-solo')
  registerSolo(
    @Param('id') id: string,
    @Body() body: RegisterTournamentSoloDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.registerSolo(
      id,
      user.id,
      body.preferredSide,
      body.availability,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/register-with-partner')
  registerWithPartner(
    @Param('id') id: string,
    @Body() body: RegisterTournamentPartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.registerWithPartner(
      id,
      user.id,
      body.partnerUserId,
    );
  }
}
