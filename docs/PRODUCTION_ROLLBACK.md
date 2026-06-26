# PGO Production Rollback

## Current References

- Pre-change backend commit: `48bc18213d96d5c38e4b41422fad753920e53a2f`
- RDS predeploy snapshot: `pgo-predeploy-20260626-043157`
- PM2 process: `pgo-backend`
- Public API: `https://api.pgoapp.com/api`
- Nginx site: `/etc/nginx/sites-available/pgo-api`
- Backend port: `127.0.0.1:3001`

## Criteria

Execute rollback only if production deploy causes failed boot, failed migrations, repeated 5xx, auth/session regression, or database errors that are not corrected by reloading the PGO process.

## Code Rollback

```bash
cd /path/to/pgo-backend
git status --short
git rev-parse HEAD
git checkout 48bc18213d96d5c38e4b41422fad753920e53a2f
npm ci
npx prisma generate
npm run build
```

Do not run `prisma migrate reset` in production.

## Prisma

```bash
npx prisma migrate status
```

If a migration already modified production data, restore from the manual RDS snapshot created before deploy instead of editing production rows manually.

## PM2

```bash
pm2 status
pm2 reload pgo-backend --update-env
pm2 save
pm2 logs pgo-backend --lines 100 --nostream
```

## Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

If Nginx config was changed during deploy, restore the dated backup created under `/etc/nginx.backup-YYYYMMDD-HHMMSS`:

```bash
sudo cp -a /etc/nginx.backup-YYYYMMDD-HHMMSS/. /etc/nginx/
sudo nginx -t
sudo systemctl reload nginx
```

## Certbot

If Certbot config was changed during deploy, restore the dated backup created under `/etc/letsencrypt.backup-YYYYMMDD-HHMMSS`:

```bash
sudo cp -a /etc/letsencrypt.backup-YYYYMMDD-HHMMSS/. /etc/letsencrypt/
sudo certbot renew --cert-name api.pgoapp.com --dry-run
sudo nginx -t
sudo systemctl reload nginx
```

## RDS Snapshot Restore

Use AWS Console or AWS CLI to restore snapshot `pgo-predeploy-20260626-043157`. Pointing production to a restored database requires explicit approval because it changes production state.

```bash
aws rds restore-db-instance-from-db-snapshot \
  --region us-east-2 \
  --db-instance-identifier NEW_INSTANCE_IDENTIFIER \
  --db-snapshot-identifier pgo-predeploy-20260626-043157
```

## Validation

```bash
curl -i http://127.0.0.1:3001/api
curl -i https://api.pgoapp.com/api
pm2 status
sudo nginx -t
```
