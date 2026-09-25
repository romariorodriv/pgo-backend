export type Trend = 'up' | 'down' | 'neutral';

export type Metric =
  | {
      available: true;
      value: number;
      previousValue?: number;
      percentageChange?: number;
      percentagePointChange?: number;
      trend: Trend;
      definition: string;
      limitation?: string;
    }
  | { available: false; reason: string };

export type ActivityPoint = {
  date: string;
  registrations: number;
  matches: number;
  openMatches: number;
  tournaments: number;
  tournamentRegistrations: number;
  uniqueActiveUsers: number;
};

export type ProductActivityEvent = {
  userId: string;
  occurredAt: Date;
};
