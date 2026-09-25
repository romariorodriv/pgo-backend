import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';
import { adminForbidden } from '../common/admin-errors';
import type { CurrentAdmin } from '../auth/admin-auth.types';

@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;
    const request = context
      .switchToHttp()
      .getRequest<{ user?: CurrentAdmin }>();
    const admin = request.user;
    if (admin && roles.includes(admin.role)) return true;
    throw adminForbidden();
  }
}
