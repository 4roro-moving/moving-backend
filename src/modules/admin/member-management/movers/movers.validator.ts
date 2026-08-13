import { MoveType } from "@prisma/client";
import { z } from "zod";

import {
  memberListDateQuerySchema,
  memberListKeywordSchema,
  memberListLimitSchema,
  memberListPageSchema,
  memberProfileCompletedSchema,
  memberStatusSchema,
  validateMemberListDateRange,
  memberListSortOrderSchema,
  memberPendingReportSortSchema,
} from "../member-list.validator";

export const moverIdParamSchema = z.object({
  id: z.uuid("올바른 기사 ID가 아닙니다."),
});

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
    sort: memberListSortOrderSchema,
    reportSort: memberPendingReportSortSchema,
    confirmedSort: z
      .enum(["CONFIRMED_DESC", "CONFIRMED_ASC"], {
        error: "확정 건수 정렬 기준은 CONFIRMED_DESC 또는 CONFIRMED_ASC여야 합니다.",
      })
      .optional(),
  })
  .superRefine(validateMemberListDateRange);
