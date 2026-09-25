# API Booking

Publica: `GET /api/clubs`, `GET /api/clubs/by-slug/:slug`, `GET /api/clubs/:id/availability?from=YYYY-MM-DD&to=YYYY-MM-DD&duration=90` y `GET /api/tournaments`.

Jugador JWT: `POST /api/reservations`, `GET /api/reservations/me`, `GET /api/reservations/:id`, `POST /api/reservations/:id/cancel`, `GET /api/open-match-alerts` y `GET /api/auth/context`.

Club JWT: `/api/club/register`, `/api/club/me`, `/dashboard`, `/courts`, `/schedules`, `/pricing`, `/blocks`, `/reservations`, `/reservations/manual`, `/calendar` y `/clients`. El club se deriva de `ClubMember`; no se confia en un `clubId` del browser.

PGO admin JWT: `/api/pgo-admin/summary`, `/users`, `/clubs`, `/clubs/:id/status`, `/courts` y `/reservations`.

Para reservar se envia solamente `courtId`, `startAt` y `durationMinutes`. El backend recalcula el precio. Conflictos de horario devuelven HTTP 409 con `code: SLOT_NOT_AVAILABLE`.
