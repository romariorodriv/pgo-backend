import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CurrentAdmin } from '../auth/admin-auth.types';

export const CurrentAdminUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentAdmin => {
    const request = ctx.switchToHttp().getRequest<{ user: CurrentAdmin }>();
    return request.user;
  },
);
