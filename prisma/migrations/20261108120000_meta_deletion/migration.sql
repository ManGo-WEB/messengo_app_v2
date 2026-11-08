-- CreateTable
CREATE TABLE "MetaDeletionRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "connectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "MetaDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaDeletionRequest_code_key" ON "MetaDeletionRequest"("code");

