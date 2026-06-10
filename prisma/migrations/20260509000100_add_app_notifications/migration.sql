CREATE TABLE "app_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_notifications_user_id_created_at_idx" ON "app_notifications"("user_id", "created_at");
CREATE INDEX "app_notifications_user_id_read_at_idx" ON "app_notifications"("user_id", "read_at");

ALTER TABLE "app_notifications"
ADD CONSTRAINT "app_notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
