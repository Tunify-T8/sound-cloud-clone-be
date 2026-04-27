-- AlterEnum
ALTER TYPE "ConversationStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowMessages" BOOLEAN NOT NULL DEFAULT true;
