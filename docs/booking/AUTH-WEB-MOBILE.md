# Auth Web y Mobile

Los contratos moviles `/api/auth/register`, `/login`, `/google`, `/apple`, `/refresh`, `/logout` y `/me` siguen entregando tokens como antes.

La web usa `/api/auth/web/login`, `/register`, `/refresh` y `/logout`. El access token vive solamente en memoria; el refresh token se guarda en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en produccion y con path `/api/auth/web`.

Las mutaciones web requieren `X-PGO-Web-Request: 1` y un `Origin` incluido en `CORS_ORIGINS`. Configurar dominios exactos, nunca wildcard con credentials.

Ejemplo productivo: `CORS_ORIGINS=https://pgoapp.com,https://www.pgoapp.com,https://staging.pgoapp.com`. Local: `http://localhost:3000`.
