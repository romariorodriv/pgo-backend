# Validación de API de producción

- Backend real: EC2 `16.58.141.210`.
- Prefijo NestJS: `/api`.
- Health: `http://16.58.141.210/api/health` responde 200.
- PM2: `pgo-backend`, online, puerto 3001.
- Nginx: configuración válida, proxy a `127.0.0.1:3001`.
- Migrations: 27, esquema de producción actualizado.
- Dominio HTTPS de API: no configurado.
- CORS: inseguro; acepta orígenes arbitrarios con credenciales.

Objetivo pendiente: crear `api.pgoapp.com`, apuntarlo a EC2, configurar certificado y Nginx, limitar CORS y generar un nuevo AAB con `https://api.pgoapp.com/api`.
