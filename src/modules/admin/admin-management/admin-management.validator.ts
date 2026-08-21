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
