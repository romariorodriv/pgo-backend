# PGO Backend

Backend base para PGO usando NestJS, Prisma y PostgreSQL.

## Stack

- NestJS
- Prisma
- PostgreSQL
- JWT
- bcrypt

## Variables de entorno

Crea o ajusta tu `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pgo_backend?schema=public"
JWT_SECRET="change-me-in-production"
JWT_EXPIRES_IN=900
PORT=3000
```

## Endpoints iniciales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api`

## Flujo para correrlo

1. Levanta PostgreSQL y crea la base `pgo_backend`.
   Si tienes Docker:

```bash
docker compose up -d
```

2. Ejecuta `npm install`.
3. Ejecuta `npx prisma generate`.
4. Ejecuta `npx prisma migrate dev --name init`.
5. Ejecuta `npm run start:dev`.

## Ejemplos

### Register

```bash
curl -X POST http://localhost:3000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Romario\",\"email\":\"romario@pgo.com\",\"password\":\"123456\"}"
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"romario@pgo.com\",\"password\":\"123456\"}"
```

### Me

```bash
curl http://localhost:3000/api/auth/me ^
  -H "Authorization: Bearer TU_TOKEN"
```
