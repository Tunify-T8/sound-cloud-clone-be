/*
  Warnings:

  - A unique constraint covering the columns `[blockerId,blockedId]` on the table `UserBlock` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
