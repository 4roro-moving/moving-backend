import { ReportReason, ReportTargetType } from "@prisma/client";
import { z } from "zod";

export const MAX_REPORT_DESCRIPTION_LENGTH = 1000;
export const MAX_REVIEW_TARGET_ID = 2_147_483_647;

// 신고 대상은 Prisma enum 전체가 아니라 1차 지원 subset만 허용합니다.
const SUPPORTED_REPORT_TARGET_TYPES = [ReportTargetType.REVIEW, ReportTargetType.MOVER] as const;
const reviewTargetIdPattern = /^[1-9]\d*$/;
const moverTargetIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidReviewTargetId(value: string): boolean {
  if (!reviewTargetIdPattern.test(value)) {
    return false;
  }

  const asBigInt = BigInt(value);

  if (asBigInt < 1n || asBigInt > BigInt(MAX_REVIEW_TARGET_ID)) {
    return false;
  }

  const asNumber = Number(value);

  return Number.isSafeInteger(asNumber) && asNumber >= 1 && asNumber <= MAX_REVIEW_TARGET_ID;
}

function isValidMoverTargetId(value: string): boolean {
  return moverTargetIdPattern.test(value);
}

export const createReportSchema = z
  .object({
    targetType: z.enum(SUPPORTED_REPORT_TARGET_TYPES),
    targetId: z
      .string("신고 대상 ID는 문자열이어야 합니다.")
      .trim()
      .min(1, "신고 대상 ID를 입력해 주세요."),
    reason: z.enum(ReportReason),
    description: z
      .string("신고 상세 내용은 문자열이어야 합니다.")
      .trim()
      .max(
        MAX_REPORT_DESCRIPTION_LENGTH,
        `신고 상세 내용은 최대 ${String(MAX_REPORT_DESCRIPTION_LENGTH)}자까지 입력할 수 있습니다.`,
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    // REVIEW는 서비스에서 안전하게 number로 변환할 수 있도록 DB Int 범위로 제한합니다.
    if (value.targetType === "REVIEW" && !isValidReviewTargetId(value.targetId)) {
      ctx.addIssue({
        code: "custom",
        path: ["targetId"],
        message: `REVIEW 대상 ID는 1 이상 ${String(MAX_REVIEW_TARGET_ID)} 이하의 정수 문자열이어야 합니다.`,
      });
    }

    if (value.targetType === "MOVER" && !isValidMoverTargetId(value.targetId)) {
      ctx.addIssue({
        code: "custom",
        path: ["targetId"],
        message: "MOVER 대상 ID는 UUID 형식이어야 합니다.",
      });
    }

    if (value.reason === "OTHER" && (!value.description || value.description.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: "기타 사유를 선택한 경우 신고 상세 내용을 입력해 주세요.",
      });
    }
  });
