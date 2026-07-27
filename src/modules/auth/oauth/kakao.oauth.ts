import { AuthProvider } from "@prisma/client";
import { z } from "zod";

import { env } from "../../../config/env";
import { AppError } from "../../../lib/app-error";

import type { OAuthProfile } from "../auth.type";

const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_INFO_URL = "https://kapi.kakao.com/v2/user/me";

/*
 * Kakao Authorization Code 교환 응답
 */
const kakaoTokenResponseSchema = z.object({
  token_type: z.string().optional(),
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
});

/*
 * Kakao 토큰 발급 오류 응답
 */
const kakaoTokenErrorSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
  error_code: z.string().optional(),
});

/*
 * Kakao UserInfo 응답
 */
const kakaoUserInfoSchema = z.object({
  id: z.number(),

  kakao_account: z.object({
    email: z.email(),
    is_email_valid: z.boolean().optional(),
    is_email_verified: z.boolean().optional(),

    profile: z
      .object({
        nickname: z.string().trim().min(1),
      })
      .optional(),
  }),
});

/*
 * Kakao Authorization Code를 Access Token으로 교환한다.
 */
const exchangeCodeForAccessToken = async (code: string): Promise<string> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.KAKAO_CLIENT_ID,
    redirect_uri: env.KAKAO_REDIRECT_URI,
    code,
    client_secret: env.KAKAO_CLIENT_SECRET,
  });

  let response: Response;

  try {
    response = await fetch(KAKAO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: body.toString(),
    });
  } catch (error) {
    console.error("[Kakao OAuth] 토큰 서버 연결 실패:", error);

    throw new AppError("BAD_GATEWAY", {
      message: "Kakao 인증 서버에 연결할 수 없습니다.",
    });
  }

  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch (error) {
    console.error("[Kakao OAuth] 토큰 응답 JSON 변환 실패:", {
      status: response.status,
      error,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "Kakao 인증 서버의 응답을 처리할 수 없습니다.",
    });
  }

  if (!response.ok) {
    const parsedError = kakaoTokenErrorSchema.safeParse(responseBody);

    console.error("[Kakao OAuth] 토큰 발급 실패:", {
      status: response.status,
      responseBody,
    });

    const errorDescription = parsedError.success ? parsedError.data.error_description : undefined;

    throw new AppError("UNAUTHORIZED", {
      message: errorDescription ?? "유효하지 않거나 만료된 Kakao 인증 코드입니다.",
    });
  }

  const parsedTokenResponse = kakaoTokenResponseSchema.safeParse(responseBody);

  if (!parsedTokenResponse.success) {
    console.error("[Kakao OAuth] 토큰 응답 검증 실패:", {
      responseBody,
      issues: parsedTokenResponse.error.issues,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "Kakao 인증 서버의 응답 형식이 올바르지 않습니다.",
    });
  }

  return parsedTokenResponse.data.access_token;
};

/*
 * Kakao Access Token으로 사용자 프로필을 조회한다.
 */
const fetchKakaoUserInfo = async (accessToken: string): Promise<OAuthProfile> => {
  let response: Response;

  try {
    response = await fetch(KAKAO_USER_INFO_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    console.error("[Kakao OAuth] 사용자 정보 서버 연결 실패:", error);

    throw new AppError("BAD_GATEWAY", {
      message: "Kakao 사용자 정보 서버에 연결할 수 없습니다.",
    });
  }

  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch (error) {
    console.error("[Kakao OAuth] 사용자 정보 JSON 변환 실패:", {
      status: response.status,
      error,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "Kakao 사용자 정보 응답을 처리할 수 없습니다.",
    });
  }

  if (!response.ok) {
    console.error("[Kakao OAuth] 사용자 정보 조회 실패:", {
      status: response.status,
      responseBody,
    });

    throw new AppError("UNAUTHORIZED", {
      message: "Kakao 사용자 정보를 확인할 수 없습니다.",
    });
  }

  const parsedUserInfo = kakaoUserInfoSchema.safeParse(responseBody);

  if (!parsedUserInfo.success) {
    console.error("[Kakao OAuth] 사용자 정보 응답 검증 실패:", {
      responseBody,
      issues: parsedUserInfo.error.issues,
    });

    throw new AppError("BAD_GATEWAY", {
      message: "Kakao 사용자 정보 응답 형식이 올바르지 않습니다.",
    });
  }

  const userInfo = parsedUserInfo.data;
  const account = userInfo.kakao_account;

  if (account.is_email_valid === false) {
    throw new AppError("UNAUTHORIZED", {
      message: "Kakao에서 유효하지 않은 이메일입니다.",
    });
  }

  if (account.is_email_verified === false) {
    throw new AppError("UNAUTHORIZED", {
      message: "Kakao에서 인증되지 않은 이메일입니다.",
    });
  }

  return {
    provider: AuthProvider.KAKAO,
    providerUserId: String(userInfo.id),
    email: account.email.trim().toLowerCase(),
    name: account.profile?.nickname.trim() ?? "카카오 사용자",
    emailVerified: account.is_email_verified ?? true,
  };
};

/*
 * Kakao Authorization Code를 받아
 * 서비스에서 사용할 공통 OAuth 프로필로 변환한다.
 */
const getKakaoOAuthProfile = async (code: string): Promise<OAuthProfile> => {
  const accessToken = await exchangeCodeForAccessToken(code);

  return fetchKakaoUserInfo(accessToken);
};

export const kakaoOAuth = {
  getKakaoOAuthProfile,
};
