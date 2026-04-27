/*
  Warnings:

  - You are about to drop the column `DeletedAt` on the `Conversation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "DeletedAt",
ADD COLUMN     "deletedAt" TIMESTAMP(3);
