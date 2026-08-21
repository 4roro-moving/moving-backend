import { z } from "zod";

import { emailSchema, nameSchema, passwordSchema, phoneSchema } from "../../auth/auth.validator";

export const createAdminBodySchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema,
});

export const adminIdParamSchema = z.strictObject({
  id: z.uuid("올바른 관리자 ID가 아닙니다."),
});

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

/**
 * 일반 ADMIN 계정 비활성화 요청
 *
 * 비활성화는 정지와 달리 계정 사용을 종료하는 조치이므로
 * 해제 기능을 제공하지 않고 처리 사유를 필수로 기록합니다.
 */
export const deactivateAdminBodySchema = z.strictObject({
  reason: z
    .string({
      error: "비활성화 사유를 입력해주세요.",
    })
    .trim()
    .min(1, {
      error: "비활성화 사유를 입력해주세요.",
    })
    .max(500, {
      error: "비활성화 사유는 500자 이하여야 합니다.",
    }),
});
