import type { NextFunction, Request, Response } from "express";

import { authService } from "./auth.service";

import type {
  GoogleOAuthInput,
  KakaoOAuthInput,
  LoginInput,
  LogoutInput,
  NaverOAuthInput,
  RefreshInput,
  SignUpInput,
} from "./auth.validator";

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
  loginWithNaver,
  refresh,
  logout,
};
