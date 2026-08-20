import { MoveType, SuspensionAction } from "@prisma/client";
import { z } from "zod";

import {
  memberListDateQuerySchema,
  memberListKeywordSchema,
  memberListLimitSchema,
  memberListPageSchema,
  memberProfileCompletedSchema,
  memberStatusSchema,
  validateMemberListDateRange,
  MEMBER_LIST_SORTS,
  createRepeatedSortsSchema,
} from "../member-list.validator";

export const moverIdParamSchema = z.object({
  id: z.uuid("올바른 기사 ID가 아닙니다."),
});

const MAX_STATUS_REASON_LENGTH = 500;
const MAX_STATUS_INTERNAL_NOTE_LENGTH = 1_000;

export const updateMoverStatusBodySchema = z.object({
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

const MOVER_LIST_SORTS = [
  ...MEMBER_LIST_SORTS,
  "CONFIRMED_DESC",
  "CONFIRMED_ASC",
  "RATING_DESC",
  "RATING_ASC",
  "CAREER_DESC",
  "CAREER_ASC",
] as const;

const moverListSortsSchema = createRepeatedSortsSchema(MOVER_LIST_SORTS);

export const listMoverQuerySchema = z
  .object({
    page: memberListPageSchema,
    limit: memberListLimitSchema,
    keyword: memberListKeywordSchema,
    status: memberStatusSchema.optional(),
    isProfileCompleted: memberProfileCompletedSchema,
    regionId: z.coerce
      .number()
      .int("지역 ID는 정수여야 합니다.")
      .positive("지역 ID는 1 이상이어야 합니다.")
      .optional(),
    moveType: z.enum(MoveType, { error: "올바른 이사 유형이 아닙니다." }).optional(),
    fromDate: memberListDateQuerySchema,
    toDate: memberListDateQuerySchema,
    sorts: moverListSortsSchema,
  })
  .superRefine(validateMemberListDateRange);
