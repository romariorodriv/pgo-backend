import { OpenMatchAlertStatus } from '@prisma/client';

export class PublicOpenMatchPreviewDto {
  id: string;
  category: string;
  format: string;
  startsAt: Date;
  club: string;
  district: string;
  missingPlayers: number;
  status: OpenMatchAlertStatus;
}
