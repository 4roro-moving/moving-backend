import { AuthProvider } from "@prisma/client";

import { env } from "../../../config/env";
import { AppError } from "../../../lib/app-error";

import type { OAuthProfile } from "../auth.type";

const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me";

const NAVER_FETCH_TIMEOUT_MS = 5000;

interface NaverTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: string;

  error?: string;
  error_description?: string;
}

interface NaverProfileResponse {
  resultcode: string;
  message: string;

  response?: {
    id?: string;
    email?: string;
    name?: string;
    nickname?: string;
    profile_image?: string;
    mobile?: string;
    mobile_e164?: string;
  };
}

/*
 * fetch 요청이 제한 시간을 초과했는지 확인한다.
 */
const isTimeoutError = (error: unknown): boolean => {
  return error instanceof Error && error.name === "TimeoutError";
};

/*
 * 네이버 Authorization Code를 Access Token으로 교환한다.
 */
const getNaverAccessToken = async (code: string, state: string): Promise<string> => {
  const queryParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.NAVER_CLIENT_ID,
    client_secret: env.NAVER_CLIENT_SECRET,
    code,
    state,
  });

  let response: Response;

  try {
    response = await fetch(`${NAVER_TOKEN_URL}?${queryParams.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(NAVER_FETCH_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (isTimeoutError(error)) {
      throw new AppError("BAD_GATEWAY", {
        message: "네이버 인증 서버의 응답 시간이 초과되었습니다.",
      });
    }

    throw new AppError("BAD_GATEWAY", {
      message: "네이버 인증 서버에 연결할 수 없습니다.",
    });
  }

  let data: NaverTokenResponse;

  try {
    data = (await response.json()) as NaverTokenResponse;
  } catch {
    throw new AppError("BAD_GATEWAY", {
      message: "네이버 인증 서버의 응답을 처리할 수 없습니다.",
    });
  }

  if (!response.ok || data.error || !data.access_token) {
    throw new AppError("UNAUTHORIZED", {
      message: "유효하지 않거나 만료된 네이버 인증 코드입니다.",
    });
  }

  return data.access_token;
};

/*
 * 네이버 Access Token으로 사용자 프로필을 조회한다.
 */
const getNaverUserProfile = async (accessToken: string): Promise<OAuthProfile> => {
  let response: Response;

  try {
    response = await fetch(NAVER_PROFILE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(NAVER_FETCH_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    if (isTimeoutError(error)) {
      throw new AppError("BAD_GATEWAY", {
        message: "네이버 사용자 정보 서버의 응답 시간이 초과되었습니다.",
      });
    }

    throw new AppError("BAD_GATEWAY", {
      message: "네이버 사용자 정보 서버에 연결할 수 없습니다.",
    });
  }

  let data: NaverProfileResponse;

  try {
    data = (await response.json()) as NaverProfileResponse;
  } catch {
    throw new AppError("BAD_GATEWAY", {
      message: "네이버 사용자 정보 응답을 처리할 수 없습니다.",
    });
  }

  const profile = data.response;

  if (!response.ok || data.resultcode !== "00" || !profile?.id) {
    throw new AppError("UNAUTHORIZED", {
      message: "네이버 사용자 정보를 조회할 수 없습니다.",
    });
  }

  /*
   * 현재 OAuth 공통 회원가입 로직에서 이메일을 사용하므로
   * 이메일 제공에 동의하지 않은 사용자는 가입할 수 없다.
   */
  if (!profile.email) {
    throw new AppError("BAD_REQUEST", {
      message: "네이버 계정의 이메일 정보 제공 동의가 필요합니다.",
    });
  }

  /*
   * 이름이 없으면 네이버 닉네임을 대신 사용한다.
   */
  const name = profile.name ?? profile.nickname;

  if (!name) {
    throw new AppError("BAD_REQUEST", {
      message: "네이버 계정의 이름 또는 별명 정보 제공 동의가 필요합니다.",
    });
  }

  return {
    provider: AuthProvider.NAVER,
    providerUserId: profile.id,
    email: profile.email.trim().toLowerCase(),
    name: name.trim(),
    emailVerified: true,
  };
};

/*
 * 네이버 Authorization Code를 공통 OAuth 프로필로 변환한다.
 */
const getNaverOAuthProfile = async (code: string, state: string): Promise<OAuthProfile> => {
  const accessToken = await getNaverAccessToken(code, state);

  return getNaverUserProfile(accessToken);
};

export const naverOAuth = {
  getNaverOAuthProfile,
};
