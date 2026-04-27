-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "DeletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;
