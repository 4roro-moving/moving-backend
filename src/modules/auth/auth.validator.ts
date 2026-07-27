import { UserRole } from "@prisma/client";
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

const passwordSchema = z
  .string({
    error: "비밀번호를 입력해주세요.",
  })
  .min(8, {
    error: "비밀번호는 8자 이상이어야 합니다.",
  })
  .max(100, {
    error: "비밀번호는 100자 이하여야 합니다.",
  })
  .refine((password) => Buffer.byteLength(password, "utf8") <= BCRYPT_PASSWORD_MAX_BYTES, {
    error: "비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.",
  });

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

const nameSchema = z
  .string({
    error: "이름을 입력해주세요.",
  })
  .trim()
  .min(1, {
    error: "이름을 입력해주세요.",
  })
  .max(50, {
    error: "이름은 50자 이하여야 합니다.",
  });

const phoneSchema = z
  .string({
    error: "휴대전화 번호를 입력해주세요.",
  })
  .trim()
  .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, {
    error: "올바른 휴대전화 번호 형식이 아닙니다.",
  })
  .transform((phone) => phone.replaceAll("-", ""));

const authorizationCodeSchema = z
  .string({
    error: "OAuth 인증 코드를 입력해주세요.",
  })
  .trim()
  .min(1, {
    error: "OAuth 인증 코드를 입력해주세요.",
  });

const stateSchema = z
  .string({
    error: "OAuth state를 입력해주세요.",
  })
  .trim()
  .min(1, {
    error: "OAuth state를 입력해주세요.",
  });

const oauthRoleSchema = z.enum([UserRole.CUSTOMER, UserRole.MOVER], {
  error: "회원 역할은 CUSTOMER 또는 MOVER여야 합니다.",
});

const refreshTokenSchema = z
  .string({
    error: "리프레시 토큰을 입력해주세요.",
  })
  .trim()
  .min(1, {
    error: "리프레시 토큰을 입력해주세요.",
  });

export const signUpSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema,
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: loginPasswordSchema,
});

/*
 * Google OAuth Authorization Code 로그인 요청
 *
 * role은 신규 OAuth 회원 생성 시에만 사용한다.
 * 기존 회원은 DB에 저장된 역할을 사용한다.
 *
 * ADMIN 계정이 일반 OAuth 요청을 통해 생성되지 않도록
 * CUSTOMER와 MOVER만 허용한다.
 */
export const googleOAuthSchema = z.strictObject({
  code: authorizationCodeSchema,
  role: oauthRoleSchema,
});

/*
 * Kakao OAuth Authorization Code 로그인 요청
 *
 * role은 신규 OAuth 회원 생성 시에만 사용한다.
 * 기존 회원은 DB에 저장된 역할을 사용한다.
 *
 * ADMIN 계정이 일반 OAuth 요청을 통해 생성되지 않도록
 * CUSTOMER와 MOVER만 허용한다.
 */
export const kakaoOAuthSchema = z.strictObject({
  code: authorizationCodeSchema,
  role: oauthRoleSchema,
});

/*
 * Naver OAuth Authorization Code 로그인 요청
 *
 * 네이버는 Authorization Code와 함께
 * state 값을 반드시 전달해야 한다.
 *
 * role은 신규 OAuth 회원 생성 시에만 사용한다.
 * 기존 회원은 DB에 저장된 역할을 사용한다.
 */
export const naverOAuthSchema = z.strictObject({
  code: authorizationCodeSchema,
  state: stateSchema,
  role: oauthRoleSchema,
});

export const refreshSchema = z.strictObject({
  refreshToken: refreshTokenSchema,
});

export const logoutSchema = z.strictObject({
  refreshToken: refreshTokenSchema,
});

export const authValidator = {
  signUp: signUpSchema,
  login: loginSchema,
  googleOAuth: googleOAuthSchema,
  kakaoOAuth: kakaoOAuthSchema,
  naverOAuth: naverOAuthSchema,
  refresh: refreshSchema,
  logout: logoutSchema,
};

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleOAuthInput = z.infer<typeof googleOAuthSchema>;
export type KakaoOAuthInput = z.infer<typeof kakaoOAuthSchema>;
export type NaverOAuthInput = z.infer<typeof naverOAuthSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
