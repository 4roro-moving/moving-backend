-- CreateEnum
CREATE TYPE "public"."RefreshTokenRevokedReason" AS ENUM ('ROTATED', 'LOGOUT', 'FORCED', 'EXPIRED', 'REUSE_DETECTED');

-- AlterTable
ALTER TABLE "public"."RefreshToken" ADD COLUMN     "familyId" UUID,
ADD COLUMN     "revokedReason" "public"."RefreshTokenRevokedReason";

-- AlterTable
ALTER TABLE "public"."estimate_requests" ALTER COLUMN "moveDate" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "public"."RefreshToken"("familyId");
