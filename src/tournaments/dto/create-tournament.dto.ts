import {
  IsBoolean,
  IsEnum,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TournamentStatus } from '@prisma/client';

export class CreateTournamentDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  tournamentType: string;

  @IsOptional()
  @IsString()
  pairingMode?: string;

  @IsInt()
  @Min(2)
  playerCapacity: number;

  @IsString()
  @IsNotEmpty()
  modality: string;

  @IsString()
  @IsNotEmpty()
  format: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  district: string;

  @IsDateString()
  startsAt: string;

  @IsString()
  @IsNotEmpty()
  prize: string;

  @IsInt()
  @Min(0)
  entryFee: number;

  @IsString()
  @IsNotEmpty()
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
