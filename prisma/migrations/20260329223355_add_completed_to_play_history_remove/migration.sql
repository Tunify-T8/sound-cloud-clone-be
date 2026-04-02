/*
  Warnings:

  - You are about to drop the `UserTrackProgress` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserTrackProgress" DROP CONSTRAINT "UserTrackProgress_trackId_fkey";

-- DropForeignKey
ALTER TABLE "UserTrackProgress" DROP CONSTRAINT "UserTrackProgress_userId_fkey";

-- AlterTable
ALTER TABLE "PlayHistory" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "UserTrackProgress";
