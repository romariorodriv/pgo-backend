# Admin Backend

MVP administrativo para `https://api.pgoapp.com/api/admin/*`.

## Variables

Usar los nombres documentados en `.env.example`. `ADMIN_JWT_SECRET` debe ser distinto de `JWT_SECRET` y tener al menos 32 caracteres.

## Migracion

La migracion `20260731170000_add_admin_backend` crea `admin_users`, `admin_refresh_tokens`, `admin_audit_logs`, `AdminRole` y `AdminStatus`.

Produccion:

```bash
npx prisma migrate deploy
npm run admin:create
```

No usar `prisma db push` ni `prisma migrate reset`.

## Sesion

El access token administrativo usa `subjectType: "ADMIN"` y `ADMIN_JWT_SECRET`. El refresh token se guarda solo como SHA-256 y se entrega en cookie HTTP-only `pgo_admin_refresh`.

El frontend debe usar `credentials: "include"` y enviar `X-PGO-Admin-Request: 1` en refresh/logout.

## Roles

- `SUPER_ADMIN`: acceso completo.
- `OPERATIONS`: dashboard y futura operacion.
- `ANALYST`: dashboard/reportes read-only.

## Dashboard

Las consultas son de solo lectura. Fechas de respuesta en ISO 8601. Las series usan etiquetas `YYYY-MM-DD` en `America/Lima`.

Estados excluidos: `CANCELED` en partidos, torneos, inscripciones y open matches.

## Indices recomendados

No creados en esta fase:

- `users(created_at, is_active)`
- `matches(created_at, status)`
- `match_participants(user_id, created_at)`
- `tournaments(created_at, starts_at, status)`
- `tournament_registrations(created_at, status, tournament_id, user_id)`
