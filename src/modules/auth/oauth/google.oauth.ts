import { AuthProvider } from "@prisma/client";
import { z } from "zod";

import { env } from "../../../config/env";
import { AppError } from "../../../lib/app-error";

import type { OAuthProfile } from "../auth.type";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USER_INFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/*
 * Google Authorization Code 교환 응답
 *
 * 실제로 사용하는 access_token만 필수로 검증하고,
 * 나머지 필드는 Google 응답 변경 가능성을 고려해 선택값으로 둔다.
 */
const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

/*
 * Google UserInfo 응답
 *
 * sub는 Google 사용자를 식별하는 고유 ID이므로
 * providerUserId로 사용한다.
 */
const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().trim().min(1),
});

/*
 * Google Authorization Code를 Access Token으로 교환한다.
 */
const exchangeCodeForAccessToken = async (code: string): Promise<string> => {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  let response: Response;

  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    throw new AppError("BAD_GATEWAY", {
      message: "Google 인증 서버에 연결할 수 없습니다.",
    });
  }

  if (!response.ok) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 Google 인증 코드입니다.",
    });
  }

  const responseBody: unknown = await response.json();
  const parsedTokenResponse = googleTokenResponseSchema.safeParse(responseBody);

  if (!parsedTokenResponse.success) {
    throw new AppError("BAD_GATEWAY", {
      message: "Google 인증 서버의 응답 형식이 올바르지 않습니다.",
    });
  }

  return parsedTokenResponse.data.access_token;
};

/*
 * Google Access Token으로 사용자 프로필을 조회한다.
 */
const fetchGoogleUserInfo = async (accessToken: string): Promise<OAuthProfile> => {
  let response: Response;

  try {
    response = await fetch(GOOGLE_USER_INFO_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new AppError("BAD_GATEWAY", {
      message: "Google 사용자 정보 서버에 연결할 수 없습니다.",
    });
  }

  if (!response.ok) {
    throw new AppError("UNAUTHORIZED", {
      message: "Google 사용자 정보를 확인할 수 없습니다.",
    });
  }

  const responseBody: unknown = await response.json();
  const parsedUserInfo = googleUserInfoSchema.safeParse(responseBody);

  if (!parsedUserInfo.success) {
    throw new AppError("BAD_GATEWAY", {
      message: "Google 사용자 정보 응답 형식이 올바르지 않습니다.",
    });
  }

  const userInfo = parsedUserInfo.data;

  if (!userInfo.email_verified) {
    throw new AppError("UNAUTHORIZED", {
      message: "Google에서 인증되지 않은 이메일입니다.",
    });
  }

  return {
    provider: AuthProvider.GOOGLE,
    providerUserId: userInfo.sub,
    email: userInfo.email.trim().toLowerCase(),
    name: userInfo.name.trim(),
    emailVerified: userInfo.email_verified,
  };
};

/*
 * Google Authorization Code를 받아
 * 서비스에서 사용할 공통 OAuth 프로필로 변환한다.
 */
const getGoogleOAuthProfile = async (code: string): Promise<OAuthProfile> => {
  const accessToken = await exchangeCodeForAccessToken(code);

  return fetchGoogleUserInfo(accessToken);
};

export const googleOAuth = {
  getGoogleOAuthProfile,
};
