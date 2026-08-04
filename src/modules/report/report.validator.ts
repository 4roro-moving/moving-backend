import { z } from "zod";

const REPORT_TARGET_TYPES = ["REVIEW", "MOVER"] as const;
const REPORT_REASONS = [
  "SPAM",
  "ABUSE",
  "FALSE_INFO",
  "INAPPROPRIATE",
  "PRIVACY",
  "OTHER",
] as const;

export const MAX_REPORT_DESCRIPTION_LENGTH = 1000;

const reviewTargetIdPattern = /^[1-9]\d*$/;

export const createReportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: z
      .string("신고 대상 ID는 문자열이어야 합니다.")
      .trim()
      .min(1, "신고 대상 ID를 입력해 주세요."),
    reason: z.enum(REPORT_REASONS),
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
    if (value.targetType === "REVIEW" && !reviewTargetIdPattern.test(value.targetId)) {
      ctx.addIssue({
        code: "custom",
        path: ["targetId"],
        message: "REVIEW 대상 ID는 양의 정수 문자열이어야 합니다.",
      });
    }

    if (value.targetType === "MOVER") {
      const result = z.uuid("MOVER 대상 ID는 UUID 형식이어야 합니다.").safeParse(value.targetId);

      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            path: ["targetId"],
            message: issue.message,
          });
        }
      }
    }

    if (value.reason === "OTHER" && (!value.description || value.description.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: "기타 사유를 선택한 경우 신고 상세 내용을 입력해 주세요.",
      });
    }
  });
