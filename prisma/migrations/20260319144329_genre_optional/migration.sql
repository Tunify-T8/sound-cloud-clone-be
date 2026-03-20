-- DropForeignKey
ALTER TABLE "Track" DROP CONSTRAINT "Track_genreId_fkey";

-- AlterTable
ALTER TABLE "Track" ALTER COLUMN "genreId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
