ALTER TABLE "CalendarEvent" ADD COLUMN "syncLeaseUntil" TIMESTAMPTZ(3), ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "syncAttempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "syncNextAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Distribution" ADD COLUMN "scheduleRevision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "scheduleNotifiedAt" TIMESTAMPTZ(3);
ALTER TABLE "Donation" ADD COLUMN "scheduleRevision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "scheduleNotifiedAt" TIMESTAMPTZ(3), ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3);
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_revision_positive" CHECK ("revision" > 0);
CREATE INDEX "CalendarEvent_sync_due" ON "CalendarEvent" ("syncStatus", "syncNextAt");
