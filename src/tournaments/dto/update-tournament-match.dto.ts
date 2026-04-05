import { IsOptional, IsString } from 'class-validator';

export class UpdateTournamentMatchDto {
  @IsString()
  winnerLabel: string;

  @IsOptional()
  @IsString()
  score?: string;
}
