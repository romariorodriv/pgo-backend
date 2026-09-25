import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AppleLoginDto {
  @IsOptional()
  @IsIn(['ios'])
  platform?: 'ios';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  pushToken?: string;
}
