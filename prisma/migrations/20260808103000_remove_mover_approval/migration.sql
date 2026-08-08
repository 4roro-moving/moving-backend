-- 기사 사업자등록증 제출 및 관리자 승인 정책을 제거합니다.
ALTER TABLE "public"."mover_profiles"
  DROP CONSTRAINT "mover_profiles_approvedBy_fkey";

DROP INDEX "public"."mover_profiles_businessNumber_key";
DROP INDEX "public"."mover_profiles_approvalStatus_idx";

ALTER TABLE "public"."mover_profiles"
  DROP COLUMN "businessNumber",
  DROP COLUMN "businessName",
  DROP COLUMN "licenseFileKey",
  DROP COLUMN "approvalStatus",
  DROP COLUMN "approvedBy",
  DROP COLUMN "approvedAt",
  DROP COLUMN "rejectReason";

DROP TYPE "public"."MoverApprovalStatus";
