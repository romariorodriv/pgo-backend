import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';

describe('AdminDashboardController', () => {
  it('protects all five dashboard handlers with admin guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminDashboardController,
    ) as unknown[];
    const handlers: Array<keyof AdminDashboardController> = [
      'summary',
      'activity',
      'funnel',
      'tournamentsAttention',
      'recentActivity',
    ];

    expect(guards).toEqual([AdminJwtAuthGuard, AdminRolesGuard]);
    for (const handler of handlers) {
      expect(typeof AdminDashboardController.prototype[handler]).toBe(
        'function',
      );
    }
  });
});
