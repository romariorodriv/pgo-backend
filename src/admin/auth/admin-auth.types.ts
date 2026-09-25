import { AdminRole, AdminStatus } from '@prisma/client';

export type AdminJwtPayload = {
  sub: string;
  email: string;
  role: AdminRole;
  subjectType: 'ADMIN';
};

export type CurrentAdmin = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: AdminStatus;
};

export type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};
