-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "subGenreId" TEXT;

-- CreateTable
CREATE TABLE "subGenre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "subGenre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subGenre_genreId_idx" ON "subGenre"("genreId");

-- CreateIndex
CREATE UNIQUE INDEX "subGenre_genreId_name_key" ON "subGenre"("genreId", "name");

-- CreateIndex
CREATE INDEX "Track_subGenreId_idx" ON "Track"("subGenreId");

-- AddForeignKey
ALTER TABLE "subGenre" ADD CONSTRAINT "subGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_subGenreId_fkey" FOREIGN KEY ("subGenreId") REFERENCES "subGenre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
