import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { RegisterTournamentPartnerDto } from './dto/register-tournament-partner.dto';
import { RegisterTournamentSoloDto } from './dto/register-tournament-solo.dto';
import { UpdateTournamentMatchDto } from './dto/update-tournament-match.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
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
      body.registrationsOpen,
    );
  }

  @Get()
  findAll() {
    return this.tournamentsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/admin-matches')
  getAdminMatches(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.getAdminMatches(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/admin-bracket')
  getAdminBracket(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.getAdminBracket(id, user.id);
  }

  @Get(':id/matches')
  getPublicMatches(@Param('id') id: string) {
    return this.tournamentsService.getPublicMatches(id);
  }

  @Get(':id/bracket')
  getPublicBracket(@Param('id') id: string) {
    return this.tournamentsService.getPublicBracket(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/generate-bracket')
  generateBracket(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.generateBracket(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/close-and-generate')
  closeAndGenerateBracket(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.closeAndGenerateBracket(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/admin-matches/:matchId/start')
  startAdminMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.startAdminMatch(id, matchId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/admin-matches/:matchId/finish')
  finishAdminMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: UpdateTournamentMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.finishAdminMatch(
      id,
      matchId,
      user.id,
      body.winnerLabel,
      body.score,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/admin-matches/:matchId/correct-result')
  correctAdminMatchResult(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: UpdateTournamentMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.correctAdminMatchResult(
      id,
      matchId,
      user.id,
      body.winnerLabel,
      body.score,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateTournamentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.update(id, user.id, body);
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

  @UseGuards(JwtAuthGuard)
  @Patch(':id/admin-registrations/:registrationId/pair/:partnerRegistrationId')
  pairAdminRegistrations(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Param('partnerRegistrationId') partnerRegistrationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.pairAdminRegistrations(
      id,
      registrationId,
      partnerRegistrationId,
      user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/admin-registrations/:registrationId/remove')
  removeAdminRegistration(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tournamentsService.removeAdminRegistration(
      id,
      registrationId,
      user.id,
    );
  }
}
