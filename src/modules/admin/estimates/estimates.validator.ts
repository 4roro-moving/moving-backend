import { z } from "zod";

const MAX_CANCELLATION_REASON_LENGTH = 500;
const MAX_CANCELLATION_INTERNAL_NOTE_LENGTH = 1_000;

export const adminEstimateIdParamSchema = z.object({
  estimateId: z.coerce.number().int().positive("견적 ID는 양의 정수여야 합니다."),
});

export const cancelAdminEstimateBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "취소 사유를 입력해 주세요.")
    .max(
      MAX_CANCELLATION_REASON_LENGTH,
      `취소 사유는 ${String(MAX_CANCELLATION_REASON_LENGTH)}자 이하여야 합니다.`,
    ),
  internalNote: z
    .string()
    .trim()
    .max(
      MAX_CANCELLATION_INTERNAL_NOTE_LENGTH,
      `내부 메모는 ${String(MAX_CANCELLATION_INTERNAL_NOTE_LENGTH)}자 이하여야 합니다.`,
    )
    .transform((value) => value || undefined)
    .optional(),
});
