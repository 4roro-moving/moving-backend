import type { CookieOptions, NextFunction, Request, Response } from "express";

import { authService } from "./auth.service";
import { AppError } from "../../lib/app-error";
import { createOAuthState, validateOAuthState } from "../../utils/oauth-state";
import { verifyRefreshToken } from "../../utils/jwt";

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
 * Cookie 만료 시간은 Refresh Token의 exp와 동일하게 설정한다.
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
 * Refresh Token을 HttpOnly Cookie에서 안전하게 조회한다.
 */
const getRefreshTokenFromCookie = (req: Request): string | undefined => {
  const refreshToken: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];

  return typeof refreshToken === "string" ? refreshToken : undefined;
};

/*
 * 서명된 Naver OAuth state Cookie를 안전하게 조회한다.
 */
const getNaverOAuthStateFromCookie = (req: Request): string | undefined => {
  const state: unknown = req.signedCookies?.[NAVER_OAUTH_STATE_COOKIE];

  return typeof state === "string" ? state : undefined;
};

/*
 * 인증 Service 결과를 클라이언트 응답 형식으로 변환한다.
 *
 * Refresh Token은 Cookie로 저장하고
 * Response Body에는 Access Token만 포함한다.
 */
const sendAuthResponse = (
  res: Response,
  statusCode: number,
  result: Awaited<ReturnType<typeof authService.login>>,
  message?: string,
): void => {
  const {
    user,
    tokens: { accessToken, refreshToken },
  } = result;

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

/*
 * 일반 고객 회원가입
 *
 * POST /auth/signup/customer
 */
const signUpCustomer = async (
  req: Request<Record<string, never>, unknown, SignUpInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.signUpCustomer(req.body);

    sendAuthResponse(res, 201, result);
  } catch (error) {
    next(error);
  }
};

/*
 * 기사 회원가입
 *
 * POST /auth/signup/mover
 */
const signUpMover = async (
  req: Request<Record<string, never>, unknown, SignUpInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.signUpMover(req.body);

    sendAuthResponse(res, 201, result);
  } catch (error) {
    next(error);
  }
};

/*
 * 로컬 로그인
 *
 * POST /auth/login
 */
const login = async (
  req: Request<Record<string, never>, unknown, LoginInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.login(req.body);

    sendAuthResponse(res, 200, result);
  } catch (error) {
    next(error);
  }
};

/*
 * Google OAuth 로그인
 *
 * POST /auth/oauth/google
 */
const loginWithGoogle = async (
  req: Request<Record<string, never>, unknown, GoogleOAuthInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.loginWithGoogle(req.body);

    sendAuthResponse(res, 200, result, "Google 로그인에 성공했습니다.");
  } catch (error) {
    next(error);
  }
};

/*
 * Kakao OAuth 로그인
 *
 * POST /auth/oauth/kakao
 */
const loginWithKakao = async (
  req: Request<Record<string, never>, unknown, KakaoOAuthInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.loginWithKakao(req.body);

    sendAuthResponse(res, 200, result, "Kakao 로그인에 성공했습니다.");
  } catch (error) {
    next(error);
  }
};

/*
 * Naver OAuth state 발급
 *
 * GET /auth/oauth/naver/state
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
 * Naver OAuth 로그인
 *
 * POST /auth/oauth/naver
 */
const loginWithNaver = async (
  req: Request<Record<string, never>, unknown, NaverOAuthInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const storedState = getNaverOAuthStateFromCookie(req);
    const isValidState = validateOAuthState(req.body.state, storedState);

    /*
     * OAuth state는 한 번만 사용할 수 있도록
     * 검증 성공 여부와 관계없이 쿠키를 제거한다.
     */
    res.clearCookie(NAVER_OAUTH_STATE_COOKIE, naverOAuthStateCookieOptions);

    if (!isValidState) {
      res.status(400).json({
        success: false,
        message: "유효하지 않은 OAuth state입니다.",
        errorCode: "INVALID_OAUTH_STATE",
      });

      return;
    }

    const result = await authService.loginWithNaver(req.body);

    sendAuthResponse(res, 200, result, "Naver 로그인에 성공했습니다.");
  } catch (error) {
    next(error);
  }
};

/*
 * Access Token 및 Refresh Token 재발급
 *
 * POST /auth/refresh
 */
const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
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
  } catch (error) {
    next(error);
  }
};

/*
 * 현재 로그인 세션 로그아웃
 *
 * POST /auth/logout
 */
const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const currentRefreshToken = getRefreshTokenFromCookie(req);

    if (currentRefreshToken) {
      await authService.logout(currentRefreshToken);
    }

    /*
     * Refresh Token 쿠키가 없는 경우에도 이미 로그아웃된 상태로 간주한다.
     * 반복 요청에도 동일한 결과를 반환하여 로그아웃의 멱등성을 보장한다.
     */
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions);

    res.status(200).json({
      success: true,
      data: null,
      message: "로그아웃되었습니다.",
    });
  } catch (error) {
    next(error);
  }
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
