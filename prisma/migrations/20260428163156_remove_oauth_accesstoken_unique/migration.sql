-- DropIndex
DROP INDEX "OAuthAccount_accessToken_key";

-- AlterTable
ALTER TABLE "OAuthAccount" ALTER COLUMN "accessToken" DROP NOT NULL;
