# Plan de migracion productiva

Esta iteracion no aplica migraciones ni modifica datos en produccion.

1. Crear snapshot y backup verificable de RDS.
2. Clonar/restaurar produccion en un entorno aislado y ejecutar toda la cadena con `prisma migrate deploy`.
3. Comparar checksums de `_prisma_migrations`. La migracion historica `20260426000100_add_tournament_slug` fue corregida para poder reproducirse desde cero; resolver esa diferencia de checksum de forma controlada antes de cualquier deploy, sin marcarla a ciegas.
4. Confirmar que la cuenta de despliegue puede crear la extension `btree_gist` y la exclusion constraint.
5. Desplegar primero el backend compatible, ejecutar migraciones una sola vez y verificar health, auth movil y consultas publicas.
6. Otorgar `PGO_ADMIN` a una cuenta existente y desplegar la web con `NEXT_PUBLIC_PGO_API_URL=https://api.pgoapp.com/api`.
7. Vigilar errores 401/409/500, conexiones DB y latencia de availability.

Rollback: retirar el trafico de las funciones Booking y volver a la version anterior del backend/web. No eliminar inmediatamente tablas o extension: la migracion es aditiva y conservar datos facilita recuperacion. Cualquier rollback destructivo requiere una migracion separada y backup validado.
