/*
  Warnings:

  - The `status` column on the `Subscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `paymentMethod` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'TRIAL');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardExpiryMonth" INTEGER,
ADD COLUMN     "cardExpiryYear" INTEGER,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "paymentMethod" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "status",
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "yearlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
