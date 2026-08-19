import { SuspensionAction } from "@prisma/client";
import { z } from "zod";

export const MAX_STATUS_REASON_LENGTH = 500;
export const MAX_STATUS_INTERNAL_NOTE_LENGTH = 1_000;

export const updateMemberStatusBodySchema = z.object({
  action: z.enum(SuspensionAction, {
    error: "처리 동작은 SUSPEND 또는 RELEASE여야 합니다.",
  }),
  reason: z
    .string()
    .trim()
    .min(1, "처리 사유를 입력해 주세요.")
    .max(
      MAX_STATUS_REASON_LENGTH,
      `처리 사유는 ${String(MAX_STATUS_REASON_LENGTH)}자 이하여야 합니다.`,
    ),
  internalNote: z
    .string()
    .trim()
    .max(
      MAX_STATUS_INTERNAL_NOTE_LENGTH,
      `내부 메모는 ${String(MAX_STATUS_INTERNAL_NOTE_LENGTH)}자 이하여야 합니다.`,
    )
    .optional(),
});

export type UpdateMemberStatusBody = z.infer<typeof updateMemberStatusBodySchema>;
