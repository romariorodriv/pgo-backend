import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReservationSource } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import {
  CreateCourtBlockDto,
  CreateCourtDto,
  CreatePriceRuleDto,
  CreateReservationDto,
  RegisterClubDto,
  SetClubStatusDto,
  SetSchedulesDto,
  UpdateCourtDto,
} from './booking.dto';
import { ClubAccessService } from './club-access.service';
import { ClubManagementService } from './club-management.service';
import { ClubsService } from './clubs.service';
import { ReservationsService } from './reservations.service';

@Controller('clubs')
export class PublicClubsController {
  constructor(
    private readonly clubs: ClubsService,
    private readonly availability: AvailabilityService,
  ) {}
  @Get() list(
    @Query('name') name?: string,
    @Query('district') district?: string,
    @Query('city') city?: string,
  ) {
    return this.clubs.list({ name, district, city });
  }
  @Get('by-slug/:slug') bySlug(@Param('slug') slug: string) {
    return this.clubs.bySlug(slug);
  }
  @Get(':id/availability') range(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('duration') duration: string,
  ) {
    return this.availability.range(id, from, to, Number(duration));
  }
}

@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class PlayerReservationsController {
  constructor(private readonly reservations: ReservationsService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservations.create(user.id, dto);
  }
  @Get('me') mine(@CurrentUser() user: AuthenticatedUser) {
    return this.reservations.mine(user.id);
  }
  @Get(':id') one(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.reservations.oneForPlayer(user.id, id);
  }
  @Post(':id/cancel') cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.reservations.cancel(user.id, id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('auth/context')
export class AccountContextController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async context(@CurrentUser() user: AuthenticatedUser) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        globalRoles: { select: { role: true } },
        clubMemberships: {
          select: {
            role: true,
            club: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });
    return account;
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club')
export class ClubManagementController {
  constructor(
    private readonly clubs: ClubsService,
    private readonly management: ClubManagementService,
    private readonly reservations: ReservationsService,
  ) {}
  @Post('register') register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterClubDto,
  ) {
    return this.clubs.register(user.id, dto);
  }
  @Get('me') me(@CurrentUser() user: AuthenticatedUser) {
    return this.management.context(user.id);
  }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.management.dashboard(user.id);
  }
  @Get('courts') courts(@CurrentUser() user: AuthenticatedUser) {
    return this.management.courts(user.id);
  }
  @Post('courts') createCourt(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCourtDto,
  ) {
    return this.management.createCourt(user.id, dto);
  }
  @Patch('courts/:id') updateCourt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.management.updateCourt(user.id, id, dto);
  }
  @Put('courts/:id') replaceCourt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.management.updateCourt(user.id, id, dto);
  }
  @Get('schedules') schedules(@CurrentUser() user: AuthenticatedUser) {
    return this.management.schedules(user.id);
  }
  @Put('schedules') setSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetSchedulesDto,
  ) {
    return this.management.setSchedules(user.id, dto);
  }
  @Get('pricing') pricing(@CurrentUser() user: AuthenticatedUser) {
    return this.management.prices(user.id);
  }
  @Post('pricing') addPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePriceRuleDto,
  ) {
    return this.management.addPrice(user.id, dto);
  }
  @Get('blocks') blocks(@CurrentUser() user: AuthenticatedUser) {
    return this.management.blocks(user.id);
  }
  @Post('blocks') addBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCourtBlockDto,
  ) {
    return this.management.addBlock(user.id, dto);
  }
  @Get('reservations') listReservations(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.management.reservations(user.id);
  }
  @Post('reservations/manual') manual(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservations.create(
      user.id,
      dto,
      ReservationSource.CLUB_MANUAL,
    );
  }
  @Get('calendar') calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('date') date?: string,
  ) {
    const start = new Date(from ?? `${date}T00:00:00-05:00`);
    const end = new Date(
      to ?? new Date(start.getTime() + 86_400_000).toISOString(),
    );
    return this.management.calendar(user.id, start, end);
  }
  @Get('clients') clients(@CurrentUser() user: AuthenticatedUser) {
    return this.management.clients(user.id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('pgo-admin')
export class BookingAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
  ) {}
  private async admin(user: AuthenticatedUser) {
    await this.access.requireGlobalAdmin(user.id);
  }
  @Get('summary') async summary(@CurrentUser() user: AuthenticatedUser) {
    await this.admin(user);
    const [players, clubs, pending, courts, reservations] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.club.count(),
      this.prisma.club.count({ where: { status: 'PENDING' } }),
      this.prisma.court.count(),
      this.prisma.reservation.count(),
    ]);
    return { players, clubs, pending, courts, reservations };
  }
  @Get('users') async users(@CurrentUser() user: AuthenticatedUser) {
    await this.admin(user);
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Get('clubs') async clubs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED',
  ) {
    await this.admin(user);
    return this.prisma.club.findMany({
      where: status ? { status } : {},
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { courts: true, reservations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Patch('clubs/:id/status') async status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetClubStatusDto,
  ) {
    await this.admin(user);
    return this.prisma.club.update({
      where: { id },
      data: { status: dto.status },
    });
  }
  @Get('courts') async courts(@CurrentUser() user: AuthenticatedUser) {
    await this.admin(user);
    return this.prisma.court.findMany({ include: { club: true } });
  }
  @Get('reservations') async reservations(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.admin(user);
    return this.prisma.reservation.findMany({
      include: {
        club: true,
        court: true,
        player: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
