CREATE TABLE "open_match_chat_messages" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_match_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "open_match_chat_messages_alert_id_created_at_idx"
ON "open_match_chat_messages"("alert_id", "created_at");

CREATE INDEX "open_match_chat_messages_user_id_idx"
ON "open_match_chat_messages"("user_id");

ALTER TABLE "open_match_chat_messages"
ADD CONSTRAINT "open_match_chat_messages_alert_id_fkey"
FOREIGN KEY ("alert_id") REFERENCES "open_match_alerts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "open_match_chat_messages"
ADD CONSTRAINT "open_match_chat_messages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
