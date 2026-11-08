-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "externalKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_connectionId_externalKey_key" ON "Conversation"("connectionId", "externalKey");

