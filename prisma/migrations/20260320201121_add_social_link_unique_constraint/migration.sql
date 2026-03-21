/*
  Warnings:

  - A unique constraint covering the columns `[userId,platform]` on the table `UserSocialLink` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserSocialLink_userId_platform_key" ON "UserSocialLink"("userId", "platform");
