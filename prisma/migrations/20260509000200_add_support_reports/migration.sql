CREATE TABLE "support_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshot_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_reports_user_id_created_at_idx" ON "support_reports"("user_id", "created_at");

ALTER TABLE "support_reports" ADD CONSTRAINT "support_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
