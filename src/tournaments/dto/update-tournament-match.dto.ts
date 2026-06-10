import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTournamentMatchDto {
  @IsString()
  @IsNotEmpty()
  winnerLabel: string;

  @IsOptional()
  @IsString()
  score?: string;
}
