CREATE TABLE "push_device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_device_tokens_token_key" ON "push_device_tokens"("token");
CREATE INDEX "push_device_tokens_user_id_idx" ON "push_device_tokens"("user_id");

ALTER TABLE "push_device_tokens"
ADD CONSTRAINT "push_device_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
