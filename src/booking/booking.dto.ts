import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ClubStatus, CourtBlockReason, CourtStatus } from '@prisma/client';

export class RegisterClubDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(5) phone: string;
  @IsString() @MinLength(5) address: string;
  @IsString() @MinLength(2) district: string;
  @IsString() @MinLength(2) city: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instagram?: string;
}

export class CreateCourtDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() indoor?: boolean;
  @IsOptional() @IsString() surface?: string;
  @IsOptional() @IsEnum(CourtStatus) status?: CourtStatus;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateCourtDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() indoor?: boolean;
  @IsOptional() @IsString() surface?: string;
  @IsOptional() @IsEnum(CourtStatus) status?: CourtStatus;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ScheduleItemDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) openTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) closeTime: string;
  @IsBoolean() active: boolean;
  @IsOptional() @IsString() courtId?: string | null;
}

export class SetSchedulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  schedules: ScheduleItemDto[];
  @IsArray() @IsInt({ each: true }) durations: number[];
}

export class CreatePriceRuleDto {
  @IsOptional() @IsString() courtId?: string | null;
  @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime: string;
  @IsInt() @Min(30) @Max(240) durationMinutes: number;
  @IsNumber() @Min(0.01) price: number;
}

export class CreateCourtBlockDto {
  @IsString() courtId: string;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() endAt?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) end?: string;
  @IsEnum(CourtBlockReason) reason: CourtBlockReason;
  @IsOptional() @IsString() notes?: string;
}

export class CreateReservationDto {
  @IsString() courtId: string;
  @IsISO8601() startAt: string;
  @IsInt() @Min(30) @Max(240) durationMinutes: number;
  @IsOptional() @IsEmail() playerEmail?: string;
  @IsOptional() @IsString() @MinLength(2) guestName?: string;
  @IsOptional() @IsString() @MinLength(5) guestPhone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class SetClubStatusDto {
  @IsEnum(ClubStatus) status: ClubStatus;
}
