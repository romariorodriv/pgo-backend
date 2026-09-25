import { IsString, MaxLength, MinLength } from 'class-validator';

export class UploadProfilePhotoDto {
  @IsString()
  @MinLength(32)
  @MaxLength(1_500_000)
  dataUrl!: string;
}
