/*
  Warnings:

  - You are about to drop the column `planType` on the `Subscription` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "planType",
ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "monthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyUploadQuotaMB" INTEGER,
    "maxTrackDurationMin" INTEGER NOT NULL DEFAULT 180,
    "maxTrackSizeGB" DOUBLE PRECISION,
    "monthlyListenersCap" INTEGER,
    "allowedDownloads" INTEGER NOT NULL DEFAULT 0,
    "enableMonetization" BOOLEAN NOT NULL DEFAULT false,
    "enablePlaylistMonetization" BOOLEAN NOT NULL DEFAULT false,
    "minRevenueShare" DOUBLE PRECISION,
    "allowReplace" BOOLEAN NOT NULL DEFAULT false,
    "allowAdvancedTabAccess" BOOLEAN NOT NULL DEFAULT false,
    "allowScheduledRelease" BOOLEAN NOT NULL DEFAULT false,
    "allowDirectDownload" BOOLEAN NOT NULL DEFAULT false,
    "allowOfflineListening" BOOLEAN NOT NULL DEFAULT false,
    "adFree" BOOLEAN NOT NULL DEFAULT false,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "advancedAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "allowCollaborativeTrack" BOOLEAN NOT NULL DEFAULT false,
    "releaseScheduling" BOOLEAN NOT NULL DEFAULT false,
    "premiumStatistics" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
