/*
  Warnings:

  - You are about to drop the `trackArtist` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `monthlyUploadMinutes` on table `SubscriptionPlan` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "trackArtist" DROP CONSTRAINT "trackArtist_trackId_fkey";

-- DropForeignKey
ALTER TABLE "trackArtist" DROP CONSTRAINT "trackArtist_userId_fkey";

-- AlterTable
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "monthlyUploadMinutes" SET NOT NULL,
ALTER COLUMN "monthlyUploadMinutes" SET DEFAULT 180;

-- DropTable
DROP TABLE "trackArtist";

-- CreateTable
CREATE TABLE "TrackArtist" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "ArtistRole" NOT NULL,

    CONSTRAINT "TrackArtist_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TrackArtist" ADD CONSTRAINT "TrackArtist_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
