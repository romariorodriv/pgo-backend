export const ADMIN_TIMEZONE = 'America/Lima';

export type AdminResponse<T> = {
  success: true;
  data: T;
  meta: {
    generatedAt: string;
    timezone: typeof ADMIN_TIMEZONE;
  };
};

export function adminOk<T>(data: T): AdminResponse<T> {
  return {
    success: true,
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      timezone: ADMIN_TIMEZONE,
    },
  };
}
