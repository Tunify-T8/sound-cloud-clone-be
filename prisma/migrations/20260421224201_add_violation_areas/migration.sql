-- CreateEnum
CREATE TYPE "ViolationArea" AS ENUM ('AUDIO', 'ARTWORK', 'TITLE', 'DESCRIPTION');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "violationAreas" "ViolationArea"[];
