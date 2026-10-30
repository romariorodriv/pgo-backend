import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOpenMatchChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  message: string;
}
