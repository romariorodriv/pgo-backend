# Arquitectura Booking PGO

PGO Mobile y PGO Web consumen el mismo backend NestJS y la misma PostgreSQL. `User` sigue siendo la identidad central. Las capacidades globales se agregan con `UserGlobalRole`; las capacidades por club, con `ClubMember`.

PGO Web no contiene Prisma, rutas API operativas ni reglas de reservas. Conserva solamente rendering, SEO y componentes cliente. El precio, disponibilidad, ownership y reserva se resuelven en NestJS.

El backend mantiene sin cambios los endpoints moviles existentes de auth, perfil, partidos, alertas, torneos y notificaciones. Los endpoints web de auth reutilizan `AuthService` y agregan una cookie HttpOnly solamente para refresh.

El antiguo subsistema `AdminUser` se conserva temporalmente por compatibilidad. Booking y la nueva web administrativa autorizan exclusivamente `UserGlobalRole.PGO_ADMIN`.
