import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ClubStatus } from '@prisma/client';

export class AdminPlatformQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(ClubStatus) status?: ClubStatus;
}
export class AdminClubStatusDto {
  @IsEnum(ClubStatus) status: ClubStatus;
  @IsEnum(ClubStatus) expectedStatus: ClubStatus;
}
