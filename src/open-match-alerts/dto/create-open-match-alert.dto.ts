import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateOpenMatchAlertDto {
  @IsString()
  category: string;

  @IsString()
  format: string;

  @IsDateString()
  startsAt: string;

  @IsString()
  club: string;

  @IsString()
  district: string;

  @IsString()
  courtStatus: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  missingPlayers: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPerPerson: number;

  @IsString()
  paymentLabel: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  invitedUserIds?: string[];
}
