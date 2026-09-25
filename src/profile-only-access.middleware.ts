import { NextFunction, Request, Response } from 'express';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const PROFILE_ONLY_MODE = 'profile_only';
const DEFAULT_MODE_FILE = '.app-access-mode';

const allowedPrefixes = [
  '/api/auth',
  '/api/profile',
  '/api/health',
  '/.well-known',
  '/apple-app-site-association',
];

const blockedPublicPrefixes = ['/torneos', '/partidos'];

function normalizePath(path: string): string {
  const withoutQuery = path.split('?')[0] || '/';
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function readAccessMode(): string {
  const modeFile = resolve(
    process.cwd(),
    process.env.APP_ACCESS_MODE_FILE || DEFAULT_MODE_FILE,
  );

  if (existsSync(modeFile)) {
    const fileMode = readFileSync(modeFile, 'utf8').trim().toLowerCase();
    if (fileMode) return fileMode;
  }

  return (process.env.APP_ACCESS_MODE || 'normal').trim().toLowerCase();
}

function isAllowedInProfileOnly(path: string): boolean {
  if (path === '/api' || path === '/api/') return true;
  return allowedPrefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/'),
  );
}

export function profileOnlyAccessMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === 'OPTIONS') return next();

  const mode = readAccessMode();
  if (mode !== PROFILE_ONLY_MODE) return next();

  const path = normalizePath(req.path || req.originalUrl || req.url);
  if (isAllowedInProfileOnly(path)) return next();

  if (
    blockedPublicPrefixes.some(
      (prefix) => path === prefix || path.startsWith(prefix + '/'),
    )
  ) {
    return res.status(404).json({
      code: 'APP_RESTRUCTURING',
      message: 'Estamos reestructurando esta seccion temporalmente.',
    });
  }

  return res.status(403).json({
    code: 'APP_RESTRUCTURING',
    message: 'Estamos reestructurando esta seccion temporalmente.',
  });
}
