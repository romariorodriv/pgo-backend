import { IsIn } from 'class-validator';

export class UpdateOpenMatchCoordinationDto {
  @IsIn(['ARRIVED', 'ON_THE_WAY', 'ARRIVING_10', 'CANNOT_GO'])
  status: 'ARRIVED' | 'ON_THE_WAY' | 'ARRIVING_10' | 'CANNOT_GO';
}
