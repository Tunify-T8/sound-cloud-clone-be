/*
  Warnings:

  - You are about to drop the column `created_at` on the `EmailVerificationToken` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `EmailVerificationToken` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `EmailVerificationToken` table. All the data in the column will be lost.
  - You are about to drop the column `revoked_at` on the `EmailVerificationToken` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `EmailVerificationToken` table. All the data in the column will be lost.
  - You are about to drop the column `access_token` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `provider_user_id` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `OAuthAccount` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `PasswordResetToken` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `PasswordResetToken` table. All the data in the column will be lost.
  - You are about to drop the column `revoked_at` on the `PasswordResetToken` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `PasswordResetToken` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `revoked_at` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `avatar_url` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `banned_by_id` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `cover_url` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `date_of_birth` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `display_name` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `is_banned` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `is_deleted` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `is_suspended` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `is_verified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `last_login_at` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `login_method` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `pass_hash` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `suspended_by_id` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `suspended_until` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `UserSocialLink` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `UserSocialLink` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `UserSocialLink` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `UserSocialLink` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[accessToken]` on the table `OAuthAccount` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider,providerUserId]` on the table `OAuthAccount` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `expiresAt` to the `EmailVerificationToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `EmailVerificationToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accessToken` to the `OAuthAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `providerUserId` to the `OAuthAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `OAuthAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `OAuthAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expiresAt` to the `PasswordResetToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `PasswordResetToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expiresAt` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateOfBirth` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `loginMethod` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `UserSocialLink` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `UserSocialLink` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_user_id_fkey";

-- DropForeignKey
ALTER TABLE "OAuthAccount" DROP CONSTRAINT "OAuthAccount_user_id_fkey";

-- DropForeignKey
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_user_id_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_user_id_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_banned_by_id_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_suspended_by_id_fkey";

-- DropForeignKey
ALTER TABLE "UserSocialLink" DROP CONSTRAINT "UserSocialLink_user_id_fkey";

-- DropIndex
DROP INDEX "EmailVerificationToken_user_id_idx";

-- DropIndex
DROP INDEX "OAuthAccount_access_token_key";

-- DropIndex
DROP INDEX "OAuthAccount_provider_provider_user_id_key";

-- DropIndex
DROP INDEX "OAuthAccount_user_id_idx";

-- DropIndex
DROP INDEX "PasswordResetToken_user_id_idx";

-- DropIndex
DROP INDEX "RefreshToken_user_id_idx";

-- DropIndex
DROP INDEX "UserSocialLink_user_id_idx";

-- AlterTable
ALTER TABLE "EmailVerificationToken" DROP COLUMN "created_at",
DROP COLUMN "deleted_at",
DROP COLUMN "expires_at",
DROP COLUMN "revoked_at",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OAuthAccount" DROP COLUMN "access_token",
DROP COLUMN "created_at",
DROP COLUMN "deleted_at",
DROP COLUMN "expires_at",
DROP COLUMN "provider_user_id",
DROP COLUMN "refresh_token",
DROP COLUMN "updated_at",
DROP COLUMN "user_id",
ADD COLUMN     "accessToken" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "providerUserId" TEXT NOT NULL,
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PasswordResetToken" DROP COLUMN "created_at",
DROP COLUMN "expires_at",
DROP COLUMN "revoked_at",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RefreshToken" DROP COLUMN "created_at",
DROP COLUMN "expires_at",
DROP COLUMN "is_active",
DROP COLUMN "revoked_at",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "avatar_url",
DROP COLUMN "banned_by_id",
DROP COLUMN "cover_url",
DROP COLUMN "created_at",
DROP COLUMN "date_of_birth",
DROP COLUMN "deleted_at",
DROP COLUMN "display_name",
DROP COLUMN "is_active",
DROP COLUMN "is_banned",
DROP COLUMN "is_deleted",
DROP COLUMN "is_suspended",
DROP COLUMN "is_verified",
DROP COLUMN "last_login_at",
DROP COLUMN "login_method",
DROP COLUMN "pass_hash",
DROP COLUMN "suspended_by_id",
DROP COLUMN "suspended_until",
DROP COLUMN "updated_at",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "bannedById" TEXT,
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "loginMethod" "LoginMethod" NOT NULL,
ADD COLUMN     "passHash" TEXT,
ADD COLUMN     "suspendedById" TEXT,
ADD COLUMN     "suspendedUntil" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "UserSocialLink" DROP COLUMN "created_at",
DROP COLUMN "deleted_at",
DROP COLUMN "updated_at",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_accessToken_key" ON "OAuthAccount"("accessToken");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerUserId_key" ON "OAuthAccount"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "UserSocialLink_userId_idx" ON "UserSocialLink"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSocialLink" ADD CONSTRAINT "UserSocialLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
