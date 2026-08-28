import type { CookieOptions, Request, RequestHandler, Response } from "express";

import { adminAuthService } from "./admin-auth.service";

import type { AdminLoginInput } from "./admin-auth.validator";

import { AppError } from "../../../lib/app-error";
import { verifyRefreshToken } from "../../../utils/jwt";

const ADMIN_REFRESH_TOKEN_COOKIE = "adminRefreshToken";

const adminRefreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/admin/auth",
};

/**
 * 관리자 Refresh Token을 HttpOnly Cookie로 저장한다.
 *
 * Cookie 만료 시각은 Refresh Token의 exp와 동일하게 설정한다.
 */
const setAdminRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  const payload = verifyRefreshToken(refreshToken);

  if (!payload.exp) {
    throw new AppError("INTERNAL_SERVER_ERROR", {
      message: "관리자 Refresh Token 만료 시간을 확인할 수 없습니다.",
    });
  }

  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE, refreshToken, {
    ...adminRefreshTokenCookieOptions,
    expires: new Date(payload.exp * 1000),
  });
};

/**
 * Cookie에서 관리자 Refresh Token을 안전하게 조회한다.
 */
const getAdminRefreshToken = (req: Request): string | undefined => {
  const refreshToken = req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE];

  return typeof refreshToken === "string" ? refreshToken : undefined;
};

/**
 * 관리자 로그인
 *
 * POST /api/admin/auth/login
 */
const login: RequestHandler = async (req, res) => {
  /*
   * 라우트의 validate 미들웨어를 통과한 요청이므로
   * AdminLoginInput으로 안전하게 좁혀 사용한다.
   */
  const { email, password } = req.body as AdminLoginInput;

  const result = await adminAuthService.login({
    email,
    password,
  });

  const {
    admin,
    tokens: { accessToken, refreshToken },
  } = result;

  setAdminRefreshTokenCookie(res, refreshToken);

  res.status(200).json({
    success: true,
    message: "관리자 로그인에 성공했습니다.",
    data: {
      admin,
      tokens: {
        accessToken,
      },
    },
  });
};

/**
 * 관리자 Access Token 및 Refresh Token 재발급
 *
 * POST /api/admin/auth/refresh
 */
const refresh: RequestHandler = async (req, res) => {
  const currentRefreshToken = getAdminRefreshToken(req);

  if (!currentRefreshToken) {
    throw new AppError("UNAUTHORIZED", {
      message: "관리자 Refresh Token이 없습니다.",
    });
  }

  const { accessToken, refreshToken } = await adminAuthService.refresh(currentRefreshToken);

  setAdminRefreshTokenCookie(res, refreshToken);

  res.status(200).json({
    success: true,
    message: "관리자 Access Token이 재발급되었습니다.",
    data: {
      tokens: {
        accessToken,
      },
    },
  });
};

/**
 * 관리자 로그아웃
 *
 * POST /api/admin/auth/logout
 */
const logout: RequestHandler = async (req, res) => {
  const currentRefreshToken = getAdminRefreshToken(req);

  /*
   * Cookie가 없더라도 이미 로그아웃된 상태로 판단하여
   * 성공 처리함으로써 로그아웃 API의 멱등성을 유지한다.
   */
  if (currentRefreshToken) {
    await adminAuthService.logout(currentRefreshToken);
  }

  res.clearCookie(ADMIN_REFRESH_TOKEN_COOKIE, adminRefreshTokenCookieOptions);

  res.status(200).json({
    success: true,
    message: "관리자 로그아웃이 완료되었습니다.",
    data: null,
  });
};

/**
 * 현재 로그인한 관리자 정보 조회
 *
 * GET /api/admin/auth/me
 *
 * requireActiveAdmin 미들웨어에서 조회하고 검증한
 * 관리자 정보를 req.admin에서 재사용한다.
 */
const getCurrentAdmin: RequestHandler = async (req, res) => {
  if (!req.admin) {
    throw new AppError("UNAUTHORIZED", {
      message: "관리자 계정을 확인할 수 없습니다.",
    });
  }

  res.status(200).json({
    success: true,
    message: "관리자 정보를 조회했습니다.",
    data: {
      admin: {
        ...req.admin,
        adminRole: req.adminProfile?.adminRole ?? null,
      },
    },
  });
};

export const adminAuthController = {
  login,
  refresh,
  logout,
  getCurrentAdmin,
};
