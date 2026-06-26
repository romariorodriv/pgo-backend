ALTER TABLE "app_notifications"
ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "app_notifications_idempotency_key_key"
ON "app_notifications"("idempotency_key");
