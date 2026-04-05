import {
  IsBoolean,
  IsEnum,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TournamentStatus } from '@prisma/client';

export class CreateTournamentDto {
  @IsString()
  title: string;

  @IsString()
  tournamentType: string;

  @IsInt()
  @Min(2)
  playerCapacity: number;

  @IsString()
  modality: string;

  @IsString()
  format: string;

  @IsString()
  location: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  city: string;

  @IsString()
  district: string;

  @IsDateString()
  startsAt: string;

  @IsString()
  prize: string;

  @IsInt()
  @Min(0)
  entryFee: number;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @IsOptional()
  @IsBoolean()
  registrationsOpen?: boolean;
}
