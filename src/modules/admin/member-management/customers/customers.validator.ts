import { AuthProvider } from "@prisma/client";
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
