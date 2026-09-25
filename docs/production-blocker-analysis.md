# Bloqueos de producción

Fecha: 20 de junio de 2026.

- Flutter release `1.0.0+3` contiene `http://16.58.141.210/api`.
- No existe DNS para `api.pgoapp.com`; HTTPS por IP falla por nombre de certificado.
- EC2 ejecuta `pgo-backend` en PM2, puerto 3001, commit `48bc182`.
- Nginx usa `pgoapp.com`, pero ese dominio público apunta a CloudFront de la web.
- CORS refleja cualquier origen con credenciales.
- `npm audit --omit=dev`: 17 vulnerabilidades altas.
- Falta probar el AAB en un dispositivo físico.
- La página `/eliminar-cuenta/` está implementada localmente, pendiente de despliegue web.
