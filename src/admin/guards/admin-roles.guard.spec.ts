import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { AdminRolesGuard } from './admin-roles.guard';

describe('AdminRolesGuard', () => {
  it('allows configured dashboard roles', () => {
    const guard = new AdminRolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue([AdminRole.ANALYST]),
    } as unknown as Reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: AdminRole.ANALYST } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
