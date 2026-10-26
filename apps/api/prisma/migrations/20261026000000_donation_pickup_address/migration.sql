ALTER TABLE "Donation" ADD COLUMN "pickupAddress" TEXT;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_pickupAddress_length"
  CHECK ("pickupAddress" IS NULL OR char_length("pickupAddress") <= 500);
