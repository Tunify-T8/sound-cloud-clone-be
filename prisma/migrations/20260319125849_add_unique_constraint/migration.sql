/*
  Warnings:

  - A unique constraint covering the columns `[user_id,platform]` on the table `UserSocialLink` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserSocialLink_user_id_platform_key" ON "UserSocialLink"("user_id", "platform");
