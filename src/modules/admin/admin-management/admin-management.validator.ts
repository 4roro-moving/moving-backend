import { z } from "zod";

import { emailSchema, nameSchema, passwordSchema, phoneSchema } from "../../auth/auth.validator";

/**
 * SUPER_ADMIN의 일반 ADMIN 생성 요청입니다.
 */
export const createAdminBodySchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema,
});

/**
 * 관리자 ID Path Parameter입니다.
 */
export const adminIdParamSchema = z.strictObject({
  id: z.uuid("올바른 관리자 ID가 아닙니다."),
});

/**
 * 관리자 정지/해제 요청입니다.
 */
export const updateAdminStatusBodySchema = z.strictObject({
  action: z.enum(["SUSPEND", "RELEASE"], {
    error: "관리자 상태 변경 action은 SUSPEND 또는 RELEASE여야 합니다.",
  }),

  reason: z
    .string({
      error: "사유를 입력해주세요.",
    })
    .trim()
    .min(1, {
      error: "사유를 입력해주세요.",
    })
    .max(500, {
      error: "사유는 500자 이하여야 합니다.",
    }),
});

/**
 * 관리자 목록 조회 Query Parameter입니다.
 *
 * - page: 페이지 번호
 * - limit: 페이지당 조회 개수
 * - keyword: 이름 또는 이메일 검색
 * - status: 활성/정지 상태
 */
export const listAdminQuerySchema = z.strictObject({
  page: z.coerce
    .number()
    .int("page는 정수여야 합니다.")
    .min(1, "page는 1 이상이어야 합니다.")
    .default(1),

  limit: z.coerce
    .number()
    .int("limit은 정수여야 합니다.")
    .min(1, "limit은 1 이상이어야 합니다.")
    .max(100, "limit은 100 이하여야 합니다.")
    .default(20),

  keyword: z.string().trim().max(100, "검색어는 100자 이하여야 합니다.").optional(),

  status: z
    .enum(["ACTIVE", "SUSPENDED"], {
      error: "관리자 상태는 ACTIVE 또는 SUSPENDED여야 합니다.",
    })
    .optional(),
});
