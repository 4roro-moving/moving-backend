import type { CookieOptions, NextFunction, Request, Response } from "express";

import { adminAuthService } from "./admin-auth.service";

import type { AdminLoginInput } from "./admin-auth.validator";

import { AppError } from "../../../lib/app-error";
import { verifyRefreshToken } from "../../../utils/jwt";

const ADMIN_REFRESH_TOKEN_COOKIE = "adminRefreshToken";

/*
 * 관리자 Refresh Token Cookie 공통 옵션
 *
 * 개발 환경에서는 HTTP localhost를 지원하고,
 * 운영 환경에서는 HTTPS 환경에서만 Cookie를 전송한다.
 */
const adminRefreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/admin/auth",
};

/*
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

/*
 * Cookie에서 관리자 Refresh Token을 안전하게 조회한다.
 */
const getAdminRefreshToken = (req: Request): string | undefined => {
  const refreshToken = req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE];

  return typeof refreshToken === "string" ? refreshToken : undefined;
};

/*
 * 관리자 로그인
 *
 * POST /api/admin/auth/login
 */
const login = async (
  req: Request<Record<string, never>, unknown, AdminLoginInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await adminAuthService.login(req.body);

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
  } catch (error) {
    next(error);
  }
};

/*
 * 관리자 Access Token 및 Refresh Token 재발급
 *
 * POST /api/admin/auth/refresh
 */
const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
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
  } catch (error) {
    next(error);
  }
};

/*
 * 관리자 로그아웃
 *
 * POST /api/admin/auth/logout
 */
const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const currentRefreshToken = getAdminRefreshToken(req);

    /*
     * Cookie가 존재할 때만 DB 세션을 폐기한다.
     *
     * Cookie가 없는 경우에도 이미 로그아웃된 상태와 동일하게
     * 처리하여 로그아웃 API의 멱등성을 유지한다.
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
  } catch (error) {
    next(error);
  }
};

/*
 * 현재 로그인한 관리자 정보 조회
 *
 * GET /api/admin/auth/me
 */
const getCurrentAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError("UNAUTHORIZED", {
        message: "인증 정보가 없습니다.",
      });
    }

    const admin = await adminAuthService.getCurrentAdmin(req.user.id);

    res.status(200).json({
      success: true,
      message: "관리자 정보를 조회했습니다.",
      data: {
        admin,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const adminAuthController = {
  login,
  refresh,
  logout,
  getCurrentAdmin,
};
