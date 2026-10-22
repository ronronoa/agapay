ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_UNREAD';
ALTER TABLE "EmailNotification" ADD COLUMN "inAppProcessedAt" TIMESTAMPTZ(3);
UPDATE "EmailNotification" SET "inAppProcessedAt" = CURRENT_TIMESTAMP;
CREATE INDEX "EmailNotification_inAppProcessedAt_idx" ON "EmailNotification"("inAppProcessedAt");
CREATE TABLE "SupportConversation" (
  id TEXT PRIMARY KEY, "donorId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  "lastSequence" INTEGER NOT NULL DEFAULT 0 CHECK("lastSequence" >= 0),
  "lastMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SupportConversation_lastMessageAt_id_idx" ON "SupportConversation"("lastMessageAt",id);
CREATE TABLE "SupportMessage" (
  id TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL REFERENCES "SupportConversation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  sequence INTEGER NOT NULL CHECK(sequence>0), "senderId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "senderRole" TEXT NOT NULL CHECK("senderRole" IN ('DONOR','STAFF','ADMIN')),
  "clientMessageId" TEXT NOT NULL, body TEXT NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("conversationId",sequence), UNIQUE("conversationId","senderId","clientMessageId")
);
CREATE TABLE "SupportRead" (
  "conversationId" TEXT NOT NULL REFERENCES "SupportConversation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "lastSequence" INTEGER NOT NULL DEFAULT 0 CHECK("lastSequence">=0),
  "lastEmailAt" TIMESTAMPTZ(3), PRIMARY KEY("conversationId","userId")
);
CREATE TABLE "InboxNotification" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('MESSAGE','OPERATION')), title TEXT NOT NULL,
  "conversationId" TEXT, "messageSequence" INTEGER, "donationId" TEXT,
  "dedupeKey" TEXT NOT NULL UNIQUE, "readAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InboxNotification_userId_createdAt_id_idx" ON "InboxNotification"("userId","createdAt",id);
CREATE INDEX "InboxNotification_userId_readAt_idx" ON "InboxNotification"("userId","readAt");
CREATE TABLE "LiveState" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE "LiveEvent" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  sequence INTEGER NOT NULL CHECK(sequence>0), topic TEXT NOT NULL CHECK(topic IN ('messages','notifications','donations')),
  "conversationId" TEXT, "publishedAt" TIMESTAMPTZ(3), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  "nextAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId",sequence)
);
CREATE INDEX "LiveEvent_publishedAt_nextAt_idx" ON "LiveEvent"("publishedAt","nextAt");
CREATE TABLE "SocketTicket" (
  hash TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "RefreshToken"(id) ON DELETE CASCADE ON UPDATE CASCADE, role TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL, "authExpiresAt" TIMESTAMPTZ(3) NOT NULL, "usedAt" TIMESTAMPTZ(3)
);
CREATE INDEX "SocketTicket_expiresAt_idx" ON "SocketTicket"("expiresAt");
