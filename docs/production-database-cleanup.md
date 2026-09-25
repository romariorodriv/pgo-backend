# Limpieza de base de datos de producción

Respaldo verificado:

```text
/home/ubuntu/backups/pgo-production-20260620-190626.dump
4,189,955 bytes
permisos 600
pg_restore --list: válido
```

Resultado:

| Modelo | Antes | Después |
|---|---:|---:|
| Usuarios | 121 | 121 |
| Perfiles | 109 | 109 |
| Torneos | 4 | 0 |
| Inscripciones | 2 | 0 |
| Alertas | 8 | 0 |
| Participantes de alertas | 4 | 0 |
| Actualizaciones de coordinación | 2 | 0 |
| Partidos casuales | 4 | 4 |

Se eliminaron 1,416 notificaciones derivadas de torneos/alertas. Se usó `scripts/clean-production-launch-data.ts`; no se ejecutó el script anterior porque eliminaba partidos casuales y estadísticas de perfiles.
