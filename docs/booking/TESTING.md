# Pruebas

Use una base PostgreSQL local exclusiva de test. Nunca apunte `DATABASE_URL` a RDS.

```powershell
npx prisma validate
npx prisma generate
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

`booking.e2e-spec.ts` crea dos usuarios y ejecuta requests concurrentes sobre la misma cancha: una reserva gana, la otra falla; también valida solapamiento parcial, cancelacion y reutilizacion del horario.

En la web ejecute `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.
