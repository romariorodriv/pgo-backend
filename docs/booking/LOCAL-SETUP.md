# Arranque local en Windows

Requiere Node.js y PostgreSQL local. No use credenciales RDS.

Backend, desde `PGO BACKEND`:

```powershell
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Defina `DATABASE_URL` local, `JWT_SECRET`, `CORS_ORIGINS=http://localhost:3000` y `PORT=3001`. Verifique `http://localhost:3001/api/health`.

Web, desde `PGO-WEB`:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Abra `http://localhost:3000`. `NEXT_PUBLIC_PGO_API_URL` debe ser `http://localhost:3001/api`.

Para otorgar admin global a una cuenta existente:

```powershell
$env:PGO_ADMIN_EMAIL='admin@pgoapp.com'
npm run pgo-admin:grant
```
