-- Add an optional display photo to campaign-specific stock rows.
-- The photo is display-only: stock math and the movement ledger are untouched.
ALTER TABLE "InventoryItem" ADD COLUMN "imageUrl" TEXT;

-- App-served paths only; the API validates the same rule in code (DB-constraints).
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_imageUrl_check" CHECK ("imageUrl" IS NULL OR "imageUrl" LIKE '/uploads/%');
