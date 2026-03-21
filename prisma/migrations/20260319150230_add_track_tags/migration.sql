/*
  Warnings:

  - You are about to drop the column `tags` on the `Track` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Track" DROP COLUMN "tags";

-- CreateTable
CREATE TABLE "TrackTag" (
    "trackId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "TrackTag_pkey" PRIMARY KEY ("trackId","tag")
);

-- AddForeignKey
ALTER TABLE "TrackTag" ADD CONSTRAINT "TrackTag_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
