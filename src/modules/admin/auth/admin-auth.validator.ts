import { z } from "zod";

const BCRYPT_PASSWORD_MAX_BYTES = 72;

const emailSchema = z
  .string({
    error: "이메일을 입력해주세요.",
  })
  .trim()
  .min(1, {
    error: "이메일을 입력해주세요.",
  })
  .max(255, {
    error: "이메일은 255자 이하여야 합니다.",
  })
  .email({
    error: "올바른 이메일 형식이 아닙니다.",
  })
  .transform((email) => email.toLowerCase());

const loginPasswordSchema = z
  .string({
    error: "비밀번호를 입력해주세요.",
  })
  .min(1, {
    error: "비밀번호를 입력해주세요.",
  })
  .refine((password) => Buffer.byteLength(password, "utf8") <= BCRYPT_PASSWORD_MAX_BYTES, {
    error: "비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.",
  });

export const adminLoginSchema = z.strictObject({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const adminAuthValidator = {
  login: adminLoginSchema,
};

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
