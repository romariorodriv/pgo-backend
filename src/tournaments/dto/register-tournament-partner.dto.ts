import { IsString } from 'class-validator';

export class RegisterTournamentPartnerDto {
  @IsString()
  partnerUserId: string;
}
