import { UserRole } from "@prisma/client";

import { z } from "zod";

import { termsAgreementsSchema } from "../terms/terms.validator";

const BCRYPT_PASSWORD_MAX_BYTES = 72;

export const emailSchema = z
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

export const passwordSchema = z
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

export const nameSchema = z
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

export const phoneSchema = z
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

const userRoleSchema = z.enum([UserRole.CUSTOMER, UserRole.MOVER], {
  error: "회원 역할은 CUSTOMER 또는 MOVER여야 합니다.",
});

/*
 * 로그인 페이지와 회원가입 페이지의 OAuth 요청을 구분한다.
 * login: 기존 회원만 로그인 / signup: 없으면 신규 생성
 */
const oauthIntentSchema = z.enum(["login", "signup"], {
  error: "OAuth intent는 login 또는 signup이어야 합니다.",
});

export const signUpSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema,
  agreements: termsAgreementsSchema.optional(),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: loginPasswordSchema,
  role: userRoleSchema,
});

/**
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
  role: userRoleSchema,
  agreements: termsAgreementsSchema.optional(),
  intent: oauthIntentSchema,
});

/**
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
  role: userRoleSchema,
  agreements: termsAgreementsSchema.optional(),
  intent: oauthIntentSchema,
});

/**
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
  role: userRoleSchema,
  agreements: termsAgreementsSchema.optional(),
  intent: oauthIntentSchema,
});

export const authValidator = {
  signUp: signUpSchema,
  login: loginSchema,
  googleOAuth: googleOAuthSchema,
  kakaoOAuth: kakaoOAuthSchema,
  naverOAuth: naverOAuthSchema,
};

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthIntent = z.infer<typeof oauthIntentSchema>;
export type GoogleOAuthInput = z.infer<typeof googleOAuthSchema>;
export type KakaoOAuthInput = z.infer<typeof kakaoOAuthSchema>;
export type NaverOAuthInput = z.infer<typeof naverOAuthSchema>;
