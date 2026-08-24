import type { CookieOptions, Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";

import { authService } from "./auth.service";
import {
  SUSPENSION_APPEAL_TOKEN_COOKIE,
  SUSPENSION_APPEAL_TOKEN_MAX_AGE,
  suspensionAppealTokenCookieOptions,
} from "./auth.cookie";
import { AppError } from "../../lib/app-error";
import { createOAuthState, validateOAuthState } from "../../utils/oauth-state";
import { verifyRefreshToken } from "../../utils/jwt";

import type { AuthResponse, SuspendedAuthResponse } from "./auth.type";
import type {
  GoogleOAuthInput,
  KakaoOAuthInput,
  LoginInput,
  NaverOAuthInput,
  SignUpInput,
} from "./auth.validator";

const REFRESH_TOKEN_COOKIE = "refreshToken";
const NAVER_OAUTH_STATE_COOKIE = "naver_oauth_state";
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;

const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/auth",
};

const naverOAuthStateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  signed: true,
  path: "/api/auth/oauth/naver",
};

/*
 * Refresh Token을 HttpOnly Cookie로 저장한다.
 *
 * Cookie 만료 시간은 Refresh Token의 exp와
 * 동일한 시간으로 설정한다.
 */
const setRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  const payload = verifyRefreshToken(refreshToken);

  if (!payload.exp) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "Refresh Token 만료 시간을 확인할 수 없습니다.",
    });
  }

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...refreshTokenCookieOptions,
    expires: new Date(payload.exp * 1000),
  });
};

/*
 * Refresh Token을 HttpOnly Cookie에서 조회한다.
 *
 * Cookie 값이 문자열인 경우에만
 * Refresh Token으로 반환한다.
 */
const getRefreshTokenFromCookie = (req: Request): string | undefined => {
  const refreshToken: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];

  return typeof refreshToken === "string" ? refreshToken : undefined;
};

/*
 * 서명된 Naver OAuth state Cookie를 조회한다.
 *
 * Cookie 값이 문자열인 경우에만
 * OAuth state로 반환한다.
 */
const getNaverOAuthStateFromCookie = (req: Request): string | undefined => {
  const state: unknown = req.signedCookies?.[NAVER_OAUTH_STATE_COOKIE];

  return typeof state === "string" ? state : undefined;
};

/*
 * 인증 Service 결과를 클라이언트 응답 형식으로 변환한다.
 *
 * Refresh Token은 HttpOnly Cookie로 저장하고,
 * Response Body에는 Access Token만 포함한다.
 */
const sendAuthResponse = (
  res: Response,
  statusCode: number,
  result: AuthResponse,
  message?: string,
): void => {
  const {
    user,
    tokens: { accessToken, refreshToken },
  } = result;

  // 다른 계정으로 정상 로그인 시 이전 정지 계정의 제한 세션을 함께 폐기한다.
  res.clearCookie(SUSPENSION_APPEAL_TOKEN_COOKIE, suspensionAppealTokenCookieOptions);
  setRefreshTokenCookie(res, refreshToken);

  res.status(statusCode).json({
    success: true,
    ...(message ? { message } : {}),
    data: {
      user,
      tokens: {
        accessToken,
      },
    },
  });
};

/** Service가 반환한 결과가 정지 계정의 제한 세션 발급 대상인지 판별한다. */
const isSuspendedAuthResponse = (
  result: AuthResponse | SuspendedAuthResponse,
): result is SuspendedAuthResponse => "suspension" in result;

/**
 * 정지 계정의 제한 세션을 문의 API 전용 HttpOnly Cookie로 설정하고,
 * 토큰 원문 없이 정지 사유·이의 제기 가능 여부를 403 응답으로 반환한다.
 */
const throwSuspendedLoginResponse = (res: Response, result: SuspendedAuthResponse): never => {
  res.cookie(SUSPENSION_APPEAL_TOKEN_COOKIE, result.suspension.appealAccessToken, {
    ...suspensionAppealTokenCookieOptions,
    maxAge: SUSPENSION_APPEAL_TOKEN_MAX_AGE,
  });

  throw new AppError("ACCOUNT_SUSPENDED", {
    data: { reason: result.suspension.reason, appealAvailable: true },
  });
};

/*
 * 일반 고객 회원가입을 진행한다.
 *
 * 회원가입 정보를 Service에 전달한 뒤
 * 생성된 사용자 정보와 Access Token을 반환한다.
 */
const signUpCustomer = async (
  req: Request<ParamsDictionary, unknown, SignUpInput>,
  res: Response,
): Promise<void> => {
  const result = await authService.signUpCustomer(req.body);

  sendAuthResponse(res, 201, result);
};

/*
 * 무버 회원가입을 진행한다.
 *
 * 회원가입 정보를 Service에 전달한 뒤
 * 생성된 사용자 정보와 Access Token을 반환한다.
 */
const signUpMover = async (
  req: Request<ParamsDictionary, unknown, SignUpInput>,
  res: Response,
): Promise<void> => {
  const result = await authService.signUpMover(req.body);

  sendAuthResponse(res, 201, result);
};

/*
 * 로컬 로그인을 진행한다.
 *
 * 이메일과 비밀번호를 Service에 전달한 뒤
 * 사용자 정보와 Access Token을 반환한다.
 */
const login = async (
  req: Request<ParamsDictionary, unknown, LoginInput>,
  res: Response,
): Promise<void> => {
  const result = await authService.login(req.body);

  if (isSuspendedAuthResponse(result)) {
    throwSuspendedLoginResponse(res, result);
  }

  sendAuthResponse(res, 200, result);
};

/*
 * Google OAuth 로그인을 진행한다.
 *
 * Google OAuth 인증 정보를 Service에 전달한 뒤
 * 사용자 정보와 Access Token을 반환한다.
 */
const loginWithGoogle = async (
  req: Request<ParamsDictionary, unknown, GoogleOAuthInput>,
  res: Response,
): Promise<void> => {
  const result = await authService.loginWithGoogle(req.body);

  if (isSuspendedAuthResponse(result)) {
    throwSuspendedLoginResponse(res, result);
  }

  sendAuthResponse(res, 200, result, "Google 로그인에 성공했습니다.");
};

/*
 * Kakao OAuth 로그인을 진행한다.
 *
 * Kakao OAuth 인증 정보를 Service에 전달한 뒤
 * 사용자 정보와 Access Token을 반환한다.
 */
const loginWithKakao = async (
  req: Request<ParamsDictionary, unknown, KakaoOAuthInput>,
  res: Response,
): Promise<void> => {
  const result = await authService.loginWithKakao(req.body);

  if (isSuspendedAuthResponse(result)) {
    throwSuspendedLoginResponse(res, result);
  }

  sendAuthResponse(res, 200, result, "Kakao 로그인에 성공했습니다.");
};

/*
 * Naver OAuth state를 발급한다.
 *
 * 생성한 state를 서명된 HttpOnly Cookie에 저장하고
 * 클라이언트 Response에도 함께 반환한다.
 */
const createNaverOAuthState = (_req: Request, res: Response): void => {
  const state = createOAuthState();

  res.cookie(NAVER_OAUTH_STATE_COOKIE, state, {
    ...naverOAuthStateCookieOptions,
    maxAge: OAUTH_STATE_MAX_AGE,
  });

  res.status(200).json({
    success: true,
    message: "Naver OAuth state가 발급되었습니다.",
    data: {
      state,
    },
  });
};

/*
 * Naver OAuth 로그인을 진행한다.
 *
 * 요청 state와 Cookie에 저장된 state를 검증한 뒤
 * Naver OAuth 인증 정보를 Service에 전달한다.
 */
const loginWithNaver = async (
  req: Request<ParamsDictionary, unknown, NaverOAuthInput>,
  res: Response,
): Promise<void> => {
  const storedState = getNaverOAuthStateFromCookie(req);
  const isValidState = validateOAuthState(req.body.state, storedState);

  /*
   * OAuth state는 한 번만 사용할 수 있도록
   * 검증 성공 여부와 관계없이 Cookie를 제거한다.
   */
  res.clearCookie(NAVER_OAUTH_STATE_COOKIE, naverOAuthStateCookieOptions);

  if (!isValidState) {
    throw new AppError("BAD_REQUEST", {
      message: "유효하지 않은 OAuth state입니다.",
    });
  }

  const result = await authService.loginWithNaver(req.body);

  if (isSuspendedAuthResponse(result)) {
    throwSuspendedLoginResponse(res, result);
  }

  sendAuthResponse(res, 200, result, "Naver 로그인에 성공했습니다.");
};

/*
 * Access Token과 Refresh Token을 재발급한다.
 *
 * HttpOnly Cookie에서 Refresh Token을 조회한 뒤
 * Token Rotation을 통해 새로운 Token을 발급한다.
 */
const refresh = async (req: Request, res: Response): Promise<void> => {
  const currentRefreshToken = getRefreshTokenFromCookie(req);

  if (!currentRefreshToken) {
    throw new AppError("UNAUTHORIZED", {
      message: "Refresh Token이 없습니다.",
    });
  }

  const { accessToken, refreshToken } = await authService.refresh(currentRefreshToken);

  setRefreshTokenCookie(res, refreshToken);

  res.status(200).json({
    success: true,
    data: {
      tokens: {
        accessToken,
      },
    },
  });
};

/*
 * 현재 로그인 세션을 로그아웃한다.
 *
 * Refresh Token이 존재하면 현재 세션을 종료하고
 * 클라이언트의 Refresh Token Cookie를 제거한다.
 */
const logout = async (req: Request, res: Response): Promise<void> => {
  const currentRefreshToken = getRefreshTokenFromCookie(req);

  if (currentRefreshToken) {
    await authService.logout(currentRefreshToken);
  }

  /*
   * Refresh Token Cookie가 없는 경우에도
   * 이미 로그아웃된 상태로 간주한다.
   *
   * 반복 요청에도 동일한 결과를 반환하여
   * 로그아웃의 멱등성을 보장한다.
   */
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions);
  // 로그아웃 시 정지 의의 제기 쿠키도 함께 삭제
  res.clearCookie(SUSPENSION_APPEAL_TOKEN_COOKIE, suspensionAppealTokenCookieOptions);

  res.status(200).json({
    success: true,
    data: null,
    message: "로그아웃되었습니다.",
  });
};

export const authController = {
  signUpCustomer,
  signUpMover,
  login,
  loginWithGoogle,
  loginWithKakao,
  createNaverOAuthState,
  loginWithNaver,
  refresh,
  logout,
};
