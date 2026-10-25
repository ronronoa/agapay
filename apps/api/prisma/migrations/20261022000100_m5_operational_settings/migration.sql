CREATE TABLE "OperationalSettings" (
  "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY CHECK ("id" = 1),
  "emailDailyLimit" INTEGER NOT NULL CHECK ("emailDailyLimit" BETWEEN 1 AND 100000),
  "emailHourlyLimit" INTEGER NOT NULL CHECK ("emailHourlyLimit" BETWEEN 1 AND 100000),
  "lowStockDefault" INTEGER NOT NULL DEFAULT 20 CHECK ("lowStockDefault" BETWEEN 0 AND 1000000),
  "retentionMonths" INTEGER NOT NULL DEFAULT 12 CHECK ("retentionMonths" BETWEEN 1 AND 120),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0)
);
