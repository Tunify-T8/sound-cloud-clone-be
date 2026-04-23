-- AlterEnum
ALTER TYPE "ConversationStatus" ADD VALUE 'BLOCKED';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false;
