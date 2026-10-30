import { Module } from '@nestjs/common';
import { ClubTrialService } from './club-trial.service';
import { AvailabilityService } from './availability.service';
import {
  AccountContextController,
  BookingAdminController,
  ClubManagementController,
  PlayerReservationsController,
  PublicClubsController,
} from './booking.controllers';
import { ClubAccessService } from './club-access.service';
import { ClubManagementService } from './club-management.service';
import { ClubsService } from './clubs.service';
import { ReservationsService } from './reservations.service';

@Module({
  controllers: [
    PublicClubsController,
    PlayerReservationsController,
    AccountContextController,
    ClubManagementController,
    BookingAdminController,
  ],
  providers: [
    ClubTrialService,
    AvailabilityService,
    ClubAccessService,
    ClubManagementService,
    ClubsService,
    ReservationsService,
  ],
  exports: [ClubAccessService, ReservationsService],
})
export class BookingModule {}
