ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0
  CHECK ("sessionVersion" >= 0);
