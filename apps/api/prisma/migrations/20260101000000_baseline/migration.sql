-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DONOR', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CalamityType" AS ENUM ('TYPHOON', 'FLOOD', 'EARTHQUAKE', 'FIRE', 'VOLCANIC_ERUPTION', 'LANDSLIDE', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('FOOD', 'WATER', 'CLOTHING', 'HYGIENE', 'BEDDING', 'SCHOOL', 'OTHER');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'REJECTED', 'VERIFIED', 'SCHEDULED', 'COLLECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'DISTRIBUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('SCHEDULED', 'DISTRIBUTED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('DONATION_DRIVE', 'COLLECTION', 'DISTRIBUTION');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('DONATION_IN', 'RESERVE', 'RELEASE', 'DISTRIBUTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DONOR_VERIFY_EMAIL', 'DONOR_PASSWORD_RESET', 'DONATION_SUBMITTED', 'DONATION_VERIFIED', 'DONATION_REJECTED', 'COLLECTION_SCHEDULED', 'COLLECTION_REMINDER', 'REQUEST_RECEIVED', 'REQUEST_VERIFY_EMAIL', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_STATUS_UPDATED', 'DISTRIBUTION_SCHEDULED', 'DISTRIBUTION_REMINDER', 'DISTRIBUTION_COMPLETED', 'DISTRIBUTION_CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DONOR',
    "phone" TEXT,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 20,
    "maxPerRequest" INTEGER,
    "perHouseholdMember" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "calamityType" "CalamityType" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "coverImageUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignArea" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "barangay" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,

    CONSTRAINT "CampaignArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPriorityItem" (
    "campaignId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "targetQuantity" INTEGER,

    CONSTRAINT "CampaignPriorityItem_pkey" PRIMARY KEY ("campaignId","itemTypeId")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "preferredDate" TIMESTAMPTZ(3),
    "preferredNote" TEXT,
    "collectionEventId" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "collectedById" TEXT,
    "collectedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationItem" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "customName" TEXT,
    "description" TEXT,
    "quantityDeclared" INTEGER NOT NULL,
    "quantityReceived" INTEGER,
    "expiryDate" TIMESTAMPTZ(3),

    CONSTRAINT "DonationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "distributed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "availableAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "distributedAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "donationItemId" TEXT,
    "distributionItemId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistanceRequest" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "barangay" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "householdSize" INTEGER,
    "campaignId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "rejectionReason" TEXT,
    "outsideCampaignArea" BOOLEAN NOT NULL DEFAULT false,
    "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "submitIpHash" TEXT,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "anonymizedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssistanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestedItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "customName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RequestedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestStatusEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "type" "CalendarEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "campaignId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "externalProvider" TEXT NOT NULL DEFAULT 'google',
    "externalEventId" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "syncError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "receivedByName" TEXT,
    "recordedById" TEXT,
    "distributedAt" TIMESTAMPTZ(3),
    "reminderSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionItem" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DistributionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailNotification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "relatedRequestId" TEXT,
    "relatedDonationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChatUsage" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_name_key" ON "ItemType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_status_startDate_idx" ON "Campaign"("status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignArea_campaignId_barangay_city_province_key" ON "CampaignArea"("campaignId", "barangay", "city", "province");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_referenceNumber_key" ON "Donation"("referenceNumber");

-- CreateIndex
CREATE INDEX "Donation_donorId_submittedAt_idx" ON "Donation"("donorId", "submittedAt");

-- CreateIndex
CREATE INDEX "Donation_status_submittedAt_idx" ON "Donation"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Donation_campaignId_status_idx" ON "Donation"("campaignId", "status");

-- CreateIndex
CREATE INDEX "DonationItem_donationId_idx" ON "DonationItem"("donationId");

-- CreateIndex
CREATE INDEX "InventoryItem_campaignId_idx" ON "InventoryItem"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_itemTypeId_campaignId_key" ON "InventoryItem"("itemTypeId", "campaignId");

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryItemId_createdAt_idx" ON "InventoryMovement"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistanceRequest_referenceNumber_key" ON "AssistanceRequest"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AssistanceRequest_trackingNumber_key" ON "AssistanceRequest"("trackingNumber");

-- CreateIndex
CREATE INDEX "AssistanceRequest_status_submittedAt_idx" ON "AssistanceRequest"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "AssistanceRequest_campaignId_status_idx" ON "AssistanceRequest"("campaignId", "status");

-- CreateIndex
CREATE INDEX "AssistanceRequest_email_campaignId_idx" ON "AssistanceRequest"("email", "campaignId");

-- CreateIndex
CREATE INDEX "AssistanceRequest_contactNumber_campaignId_idx" ON "AssistanceRequest"("contactNumber", "campaignId");

-- CreateIndex
CREATE INDEX "RequestedItem_requestId_idx" ON "RequestedItem"("requestId");

-- CreateIndex
CREATE INDEX "RequestStatusEvent_requestId_createdAt_idx" ON "RequestStatusEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_campaignId_startAt_idx" ON "CalendarEvent"("campaignId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_type_startAt_idx" ON "CalendarEvent"("type", "startAt");

-- CreateIndex
CREATE INDEX "Distribution_requestId_idx" ON "Distribution"("requestId");

-- CreateIndex
CREATE INDEX "Distribution_calendarEventId_status_idx" ON "Distribution"("calendarEventId", "status");

-- CreateIndex
CREATE INDEX "DistributionItem_distributionId_idx" ON "DistributionItem"("distributionId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailNotification_dedupeKey_key" ON "EmailNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailNotification_status_scheduledFor_priority_idx" ON "EmailNotification"("status", "scheduledFor", "priority");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatUsage_actorKey_day_key" ON "ChatUsage"("actorKey", "day");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignArea" ADD CONSTRAINT "CampaignArea_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPriorityItem" ADD CONSTRAINT "CampaignPriorityItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPriorityItem" ADD CONSTRAINT "CampaignPriorityItem_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_collectionEventId_fkey" FOREIGN KEY ("collectionEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationItem" ADD CONSTRAINT "DonationItem_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationItem" ADD CONSTRAINT "DonationItem_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_donationItemId_fkey" FOREIGN KEY ("donationItemId") REFERENCES "DonationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_distributionItemId_fkey" FOREIGN KEY ("distributionItemId") REFERENCES "DistributionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestedItem" ADD CONSTRAINT "RequestedItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AssistanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestedItem" ADD CONSTRAINT "RequestedItem_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStatusEvent" ADD CONSTRAINT "RequestStatusEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AssistanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AssistanceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNotification" ADD CONSTRAINT "EmailNotification_relatedRequestId_fkey" FOREIGN KEY ("relatedRequestId") REFERENCES "AssistanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNotification" ADD CONSTRAINT "EmailNotification_relatedDonationId_fkey" FOREIGN KEY ("relatedDonationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- -- Hand-written constraints (database.md section 4, DB-01). Prisma cannot
-- express CHECK constraints or partial unique indexes, so they live here.

-- Inventory counters can never go negative (BR-INV-01)
ALTER TABLE "InventoryItem"
  ADD CONSTRAINT inventory_non_negative
  CHECK (available >= 0 AND reserved >= 0 AND distributed >= 0);

-- Quantities must be positive. A declared donation is strictly positive; a
-- received quantity may be zero, meaning the donor delivered nothing of that
-- line, which is a legitimate outcome at collection.
ALTER TABLE "DonationItem"
  ADD CONSTRAINT donation_item_qty CHECK (
    "quantityDeclared" > 0
    AND ("quantityReceived" IS NULL OR "quantityReceived" >= 0));
ALTER TABLE "RequestedItem"    ADD CONSTRAINT requested_item_qty   CHECK (quantity > 0);
ALTER TABLE "DistributionItem" ADD CONSTRAINT distribution_item_qty CHECK (quantity > 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT movement_qty         CHECK (quantity > 0);

-- An event must end after it starts (BR-DIS-04).
ALTER TABLE "CalendarEvent"
  ADD CONSTRAINT event_time_order CHECK ("endAt" > "startAt");

-- One active request per email per campaign (D-10, BR-REQ-02).
-- REJECTED, DISTRIBUTED and CANCELLED are deliberately absent from the
-- predicate, which is what allows a fresh request after a rejection.
CREATE UNIQUE INDEX one_active_request_per_email_campaign
  ON "AssistanceRequest" (lower("email"), "campaignId")
  WHERE status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED');

-- A request has at most one live distribution (BR-DIS-02).
CREATE UNIQUE INDEX one_live_distribution_per_request
  ON "Distribution" ("requestId")
  WHERE status = 'SCHEDULED';

-- Rejection always carries a reason shown to the person affected
-- (BR-REQ-05, BR-DON-03).
ALTER TABLE "AssistanceRequest"
  ADD CONSTRAINT rejected_has_reason
  CHECK (status <> 'REJECTED'
         OR ("rejectionReason" IS NOT NULL AND length(trim("rejectionReason")) > 0));
ALTER TABLE "Donation"
  ADD CONSTRAINT donation_rejected_has_reason
  CHECK (status <> 'REJECTED'
         OR ("rejectionReason" IS NOT NULL AND length(trim("rejectionReason")) > 0));

-- Case-insensitive email uniqueness (DB-04). The column-level unique from
-- schema.prisma cannot catch Ana@ vs ana@, because the app normalises on write
-- but the database must not depend on that.
CREATE UNIQUE INDEX user_email_lower_key ON "User" (lower("email"));