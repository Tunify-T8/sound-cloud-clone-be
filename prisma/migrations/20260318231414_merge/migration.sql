/*
  Warnings:

  - You are about to drop the `TrackArtist` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TrackArtist" DROP CONSTRAINT "TrackArtist_trackId_fkey";

-- DropForeignKey
ALTER TABLE "TrackArtist" DROP CONSTRAINT "TrackArtist_userId_fkey";

-- DropTable
DROP TABLE "TrackArtist";

-- CreateTable
CREATE TABLE "trackArtist" (
    "trackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ArtistRole" NOT NULL,

    CONSTRAINT "trackArtist_pkey" PRIMARY KEY ("trackId","userId")
);

-- AddForeignKey
ALTER TABLE "trackArtist" ADD CONSTRAINT "trackArtist_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trackArtist" ADD CONSTRAINT "trackArtist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
