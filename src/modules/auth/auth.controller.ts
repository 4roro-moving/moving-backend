import type { NextFunction, Request, Response } from "express";

import { authService } from "./auth.service";
import { createOAuthState, validateOAuthState } from "../../utils/oauth-state";

import type {
  GoogleOAuthInput,
  KakaoOAuthInput,
  LoginInput,
  LogoutInput,
  NaverOAuthInput,
  RefreshInput,
  SignUpInput,
} from "./auth.validator";

const NAVER_OAUTH_STATE_COOKIE = "naver_oauth_state";
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;

const naverOAuthStateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  signed: true,
  path: "/api/auth/oauth/naver",
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

    res.status(201).json({
      success: true,
      data: result,
    });
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

    res.status(201).json({
      success: true,
      data: result,
    });
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

    res.status(200).json({
      success: true,
      data: result,
    });
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

    res.status(200).json({
      success: true,
      message: "Google 로그인에 성공했습니다.",
      data: result,
    });
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

    res.status(200).json({
      success: true,
      message: "Kakao 로그인에 성공했습니다.",
      data: result,
    });
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
    const storedState = req.signedCookies?.[NAVER_OAUTH_STATE_COOKIE] as string | undefined;

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

    res.status(200).json({
      success: true,
      message: "Naver 로그인에 성공했습니다.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/*
 * Access Token 및 Refresh Token 재발급
 *
 * POST /auth/refresh
 */
const refresh = async (
  req: Request<Record<string, never>, unknown, RefreshInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tokens = await authService.refresh(req.body);

    res.status(200).json({
      success: true,
      data: {
        tokens,
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
const logout = async (
  req: Request<Record<string, never>, unknown, LogoutInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await authService.logout(req.body);

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
