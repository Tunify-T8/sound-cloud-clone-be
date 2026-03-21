/*
  Warnings:

  - You are about to drop the column `monthlyUploadQuotaMB` on the `SubscriptionPlan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SubscriptionPlan" DROP COLUMN "monthlyUploadQuotaMB",
ADD COLUMN     "monthlyUploadMinutes" INTEGER;
