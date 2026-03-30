import { IsString } from 'class-validator';

export class RegisterTournamentSoloDto {
  @IsString()
  preferredSide: string;

  @IsString()
  availability: string;
}
