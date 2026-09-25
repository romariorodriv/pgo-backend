import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export const adminErrorCodes = {
  unauthorized: 'ADMIN_UNAUTHORIZED',
  forbidden: 'ADMIN_FORBIDDEN',
  invalidCredentials: 'ADMIN_INVALID_CREDENTIALS',
  locked: 'ADMIN_ACCOUNT_LOCKED',
  csrf: 'ADMIN_CSRF_REJECTED',
} as const;

export function adminUnauthorized(message = 'No autorizado') {
  return new UnauthorizedException({
    success: false,
    error: { code: adminErrorCodes.unauthorized, message },
  });
}

export function adminForbidden(message = 'Sin permisos') {
  return new ForbiddenException({
    success: false,
    error: { code: adminErrorCodes.forbidden, message },
  });
}
