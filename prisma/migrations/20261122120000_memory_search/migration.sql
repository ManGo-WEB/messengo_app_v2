CREATE TABLE "RagDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL, "direction" "MessageDirection" NOT NULL, "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, "searchVector" tsvector,
  CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RagDocument_messageId_key" ON "RagDocument"("messageId");
CREATE INDEX "RagDocument_organizationId_direction_createdAt_idx" ON "RagDocument"("organizationId", "direction", "createdAt");
CREATE INDEX "RagDocument_searchVector_idx" ON "RagDocument" USING gin ("searchVector");
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "RagIndexState" (
  "id" TEXT NOT NULL, "lastCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageId" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RagIndexState_pkey" PRIMARY KEY ("id")
);
