import { ReportReason, ReportTargetType } from "@prisma/client";
import { z } from "zod";

import { reportImageKeysSchema } from "./report-image.validator";

export const MAX_REPORT_DESCRIPTION_LENGTH = 1000;
export const MAX_REPORT_NUMERIC_TARGET_ID = 2_147_483_647;
// 기존 테스트/참조 호환용 alias
export const MAX_REVIEW_TARGET_ID = MAX_REPORT_NUMERIC_TARGET_ID;

const MAX_SAFE_REPORT_NUMERIC_TARGET_ID = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_PRISMA_INT_TARGET_ID = BigInt(MAX_REPORT_NUMERIC_TARGET_ID);

const SUPPORTED_REPORT_TARGET_TYPES = [
  ReportTargetType.CUSTOMER,
  ReportTargetType.MOVER,
  ReportTargetType.REVIEW,
  ReportTargetType.RESIDENCE_REVIEW,
  ReportTargetType.GIVEAWAY,
] as const;

const numericTargetIdPattern = /^[1-9]\d*$/;
const userTargetIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidNumericTargetId(value: string): boolean {
  if (!numericTargetIdPattern.test(value)) {
    return false;
  }

  const asBigInt = BigInt(value);

  if (asBigInt > MAX_SAFE_REPORT_NUMERIC_TARGET_ID) {
    return false;
  }

  if (asBigInt > MAX_PRISMA_INT_TARGET_ID) {
    return false;
  }

  const asNumber = Number(asBigInt);

  return (
    Number.isSafeInteger(asNumber) && asNumber >= 1 && asNumber <= MAX_REPORT_NUMERIC_TARGET_ID
  );
}

function isValidUserTargetId(value: string): boolean {
  return userTargetIdPattern.test(value);
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
    imageKeys: reportImageKeysSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.targetType === "REVIEW" ||
        value.targetType === "RESIDENCE_REVIEW" ||
        value.targetType === "GIVEAWAY") &&
      !isValidNumericTargetId(value.targetId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["targetId"],
        message: `${value.targetType} 대상 ID는 1 이상 ${String(
          MAX_REPORT_NUMERIC_TARGET_ID,
        )} 이하의 정수 문자열이어야 합니다.`,
      });
    }

    if (
      (value.targetType === "MOVER" || value.targetType === "CUSTOMER") &&
      !isValidUserTargetId(value.targetId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["targetId"],
        message: `${value.targetType} 대상 ID는 UUID 형식이어야 합니다.`,
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

const MAX_REPORT_LIST_PAGE = 10000;

export const listMyReportsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("페이지 번호는 정수여야 합니다.")
    .positive("페이지 번호는 1 이상이어야 합니다.")
    .max(MAX_REPORT_LIST_PAGE, `페이지 번호는 ${String(MAX_REPORT_LIST_PAGE)} 이하여야 합니다.`)
    .default(1),
  limit: z.coerce
    .number()
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 50 이하여야 합니다.")
    .default(10),
});
