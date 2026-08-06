-- CreateEnum
CREATE TYPE "public"."RefreshTokenSessionType" AS ENUM ('USER', 'ADMIN');

-- DropIndex
DROP INDEX "public"."RefreshToken_userId_idx";

-- AlterTable
ALTER TABLE "public"."RefreshToken" ADD COLUMN     "sessionType" "public"."RefreshTokenSessionType" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "RefreshToken_userId_sessionType_idx" ON "public"."RefreshToken"("userId", "sessionType");
