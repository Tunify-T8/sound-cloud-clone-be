-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'TRACK_LIKE', 'USER', 'PLAYLIST', 'ALBUM', 'UPLOAD');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "collectionId" TEXT,
ADD COLUMN     "trackId" TEXT,
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "content" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Message_trackId_idx" ON "Message"("trackId");

-- CreateIndex
CREATE INDEX "Message_collectionId_idx" ON "Message"("collectionId");

-- CreateIndex
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
