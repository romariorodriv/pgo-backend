import { ExperienceLevel } from '@prisma/client';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categorySuggested?: string;

  @IsOptional()
  @IsString()
  categoryPreliminary?: string;

  @IsOptional()
  @IsString()
  categoryMaxApplied?: string;

  @IsOptional()
  @IsInt()
  categoryScore?: number;

  @IsOptional()
  @IsObject()
  categoryQuizAnswers?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  categoryIsProvisional?: boolean;

  @IsOptional()
  @IsString()
  categoryOrigin?: string;

  @IsOptional()
  @IsString()
  preferredClub?: string;

  @IsOptional()
  @IsString()
  preferredSide?: string;

  @IsOptional()
  @IsString()
  racketModel?: string;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsBoolean()
  hasSeenHomeGuide?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCompletedInitialOnboarding?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMatchInvites?: boolean;
}
