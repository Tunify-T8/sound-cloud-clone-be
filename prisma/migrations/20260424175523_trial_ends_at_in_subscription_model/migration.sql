/*
  Warnings:

  - You are about to drop the column `trialEndsAt` on the `SubscriptionPlan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SubscriptionPlan" DROP COLUMN "trialEndsAt";
