import { IsOptional, IsString } from 'class-validator';

export class AdminAddRegistrationDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  partnerUserId?: string;
}
