import { AuthProvider, SuspensionAction } from "@prisma/client";
import { z } from "zod";

import {
  memberListDateQuerySchema,
  memberListKeywordSchema,
  memberListLimitSchema,
  memberListPageSchema,
  memberProfileCompletedSchema,
  memberStatusSchema,
  validateMemberListDateRange,
  memberListSortsSchema,
} from "../member-list.validator";

export const customerIdParamSchema = z.object({
  id: z.uuid("올바른 회원 ID가 아닙니다."),
});

const MAX_STATUS_REASON_LENGTH = 500;
const MAX_STATUS_INTERNAL_NOTE_LENGTH = 1_000;

export const updateCustomerStatusBodySchema = z.object({
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
    .transform((value) => value || undefined)
    .optional(),
});

export const listCustomerQuerySchema = z
  .object({
    page: memberListPageSchema,
    limit: memberListLimitSchema,
    keyword: memberListKeywordSchema,
    status: memberStatusSchema.optional(),
    authProvider: z.enum(AuthProvider, { error: "올바른 가입 방식이 아닙니다." }).optional(),
    isProfileCompleted: memberProfileCompletedSchema,
    fromDate: memberListDateQuerySchema,
    toDate: memberListDateQuerySchema,
    sorts: memberListSortsSchema,
  })
  .superRefine(validateMemberListDateRange);
