-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "secretToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Collection_secretToken_key" ON "Collection"("secretToken");