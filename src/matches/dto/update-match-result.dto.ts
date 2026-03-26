import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class MatchGameDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  team1: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  team2: number;
}

export class UpdateMatchResultDto {
  @IsDateString()
  playedAt: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  winnerTeam: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MatchGameDto)
  games: MatchGameDto[];
}
