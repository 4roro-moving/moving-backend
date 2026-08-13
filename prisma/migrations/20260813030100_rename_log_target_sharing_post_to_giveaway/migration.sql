-- LogTargetType: SHARING_POST → GIVEAWAY (ReportTargetType / Giveaway 모델 명명과 통일)
ALTER TYPE "public"."LogTargetType" RENAME VALUE 'SHARING_POST' TO 'GIVEAWAY';
