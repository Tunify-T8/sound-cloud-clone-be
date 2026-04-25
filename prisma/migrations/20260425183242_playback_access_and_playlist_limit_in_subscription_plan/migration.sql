-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "playbackAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "playlistLimit" INTEGER NOT NULL DEFAULT 3;
