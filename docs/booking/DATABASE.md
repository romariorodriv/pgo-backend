# Base de datos

La migracion `20260925090000_add_booking_platform` es aditiva. Incorpora `Club`, `ClubMember`, `Court`, `Schedule`, `AllowedDuration`, `PriceRule`, `CourtBlock`, `Reservation` y `UserGlobalRole`; no hace obligatorios nuevos campos de `User` o `Profile`.

Los importes son `Decimal`. Los tiempos de reserva son `TIMESTAMPTZ` y cada club conserva su timezone, inicialmente `America/Lima`.

PostgreSQL impide reservas confirmadas solapadas mediante `btree_gist` y una exclusion constraint sobre cancha y rango `[startAt,endAt)`. La transaccion de aplicacion usa ademas un advisory lock por cancha.

`Profile.preferredClub` permanece como texto por compatibilidad movil.
