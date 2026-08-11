import { z } from "zod";

export const adminEstimateIdParamSchema = z.object({
  estimateId: z.coerce.number().int().positive("견적 ID는 양의 정수여야 합니다."),
});

export const cancelAdminEstimateBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "취소 사유를 입력해 주세요.")
    .max(500, "취소 사유는 500자 이하여야 합니다."),
  internalNote: z.string().trim().max(1000, "내부 메모는 1000자 이하여야 합니다.").optional(),
});
