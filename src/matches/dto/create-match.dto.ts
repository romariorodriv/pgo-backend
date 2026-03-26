import { MatchType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateMatchDto {
  @IsString()
  clubName: string;

  @IsDateString()
  playedAt: string;

  @IsEnum(MatchType)
  matchType: MatchType;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsUUID('4', { each: true })
  participantIds: string[];
}
