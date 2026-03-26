import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  title: string;

  @IsInt()
  @Min(2)
  playerCapacity: number;

  @IsString()
  location: string;

  @IsDateString()
  startsAt: string;

  @IsInt()
  @Min(0)
  prize: number;

  @IsInt()
  @Min(0)
  entryFee: number;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  description?: string;
}
