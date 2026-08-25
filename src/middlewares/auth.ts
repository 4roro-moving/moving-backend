import type { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../lib/app-error";
import { prisma } from "../lib/prisma";
import { INQUIRY_ACCESS } from "../constants/inquiry-access";
import { verifyAccessToken, verifyAccessTokenOptional } from "../utils/jwt";
import {
  SUSPENSION_APPEAL_TOKEN_COOKIE,
  suspensionAppealTokenCookieOptions,
} from "../modules/auth/auth.cookie";

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const authorization = req.header("authorization");

    if (!authorization) {
      throw new AppError("UNAUTHORIZED", {
        message: "Access Token이 필요합니다.",
      });
    }

    const [scheme, token, ...rest] = authorization.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
      throw new AppError("UNAUTHORIZED", {
        message: "Authorization 헤더 형식이 올바르지 않습니다.",
      });
    }

    const payload = verifyAccessToken(token);

    // 정지 이의 제기 제한 세션은 문의 API 외 일반 서비스 인증에 사용할 수 없다.
    if (payload.purpose !== undefined) {
      throw new AppError("UNAUTHORIZED", {
        message: "일반 서비스에 사용할 수 없는 Access Token입니다.",
      });
    }

    // 토큰 발급 후 변경된 정지·탈퇴 상태를 즉시 반영하기 위해 현재 계정 상태를 조회한다.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true, deletedAt: true },
    });

    if (user && !user.isActive && user.deletedAt === null) {
      throw new AppError("ACCOUNT_SUSPENDED");
    }

    if (!user || user.deletedAt !== null) {
      throw new AppError("FORBIDDEN", {
        message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
      });
    }

    req.user = {
      id: payload.userId,
      role: payload.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function authorize(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(
        new AppError("UNAUTHORIZED", {
          message: "인증이 필요합니다.",
        }),
      );

      return;
    }

    if (!roles.includes(req.user.role)) {
      next(
        new AppError("FORBIDDEN", {
          message: "해당 요청을 수행할 권한이 없습니다.",
        }),
      );

      return;
    }

    next();
  };
}

/** 제한 토큰 자체가 무효한 경우에만 Cookie를 제거한다. 일시적인 DB·서버 오류에서는 재시도를 위해 유지한다. */
const shouldClearSuspensionAppealCookie = (error: unknown): boolean =>
  error instanceof AppError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN");

/**
 * 문의 API 인증.
 *
 * 활성 계정은 일반 로그인 세션으로, 정지 계정은 이의 제기 제한 세션으로 접근한다.
 */
export const authenticateInquiryAccess: RequestHandler = async (req, res, next) => {
  const cookieToken: unknown = req.cookies?.[SUSPENSION_APPEAL_TOKEN_COOKIE];
  const hasSuspensionAppealCookie = typeof cookieToken === "string";

  try {
    const authorization = req.header("authorization");
    let token: string | undefined;

    // 제한 세션 Cookie가 있으면 기존 Authorization 헤더보다 우선해 처리한다.
    if (hasSuspensionAppealCookie) {
      token = cookieToken;
    } else if (authorization) {
      const [scheme, bearerToken, ...rest] = authorization.trim().split(/\s+/);
      if (scheme?.toLowerCase() !== "bearer" || !bearerToken || rest.length > 0) {
        throw new AppError("UNAUTHORIZED", {
          message: "Authorization 헤더 형식이 올바르지 않습니다.",
        });
      }
      token = bearerToken;
    }

    if (!token) {
      throw new AppError("UNAUTHORIZED", { message: "Access Token이 필요합니다." });
    }

    const payload = verifyAccessToken(token);

    // 제한 세션 Cookie에는 이의 제기 전용 토큰만 허용한다.
    if (hasSuspensionAppealCookie && payload.purpose !== "SUSPENSION_APPEAL") {
      throw new AppError("UNAUTHORIZED", {
        message: "유효하지 않은 이의 제기 세션입니다.",
      });
    }

    // 제한 세션의 정지 해제·탈퇴 여부를 즉시 반영하기 위해 현재 계정 상태를 조회한다.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true, deletedAt: true },
    });

    if (!user || user.deletedAt !== null) {
      throw new AppError("FORBIDDEN", {
        message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
      });
    }

    // 정지 해제된 계정에서는 이의 제기 전용 세션을 사용할 수 없다.
    if (payload.purpose === "SUSPENSION_APPEAL") {
      if (user.isActive) {
        throw new AppError("UNAUTHORIZED", {
          message: "만료되었거나 유효하지 않은 이의 제기 세션입니다.",
        });
      }

      req.inquiryAccess = INQUIRY_ACCESS.SUSPENSION_APPEAL;
    } else {
      if (!user.isActive) {
        throw new AppError("ACCOUNT_SUSPENDED");
      }

      req.inquiryAccess = INQUIRY_ACCESS.STANDARD;
    }

    req.user = {
      id: payload.userId,
      role: payload.role,
    };

    next();
  } catch (error) {
    if (hasSuspensionAppealCookie && shouldClearSuspensionAppealCookie(error)) {
      res.clearCookie(SUSPENSION_APPEAL_TOKEN_COOKIE, suspensionAppealTokenCookieOptions);
    }
    next(error);
  }
};

/**
 * 비회원 조회 허용 + 유효 토큰이면 req.user 설정.
 * - 헤더 없음 → 비회원
 * - Access Token 만료 → 비회원 (목록 등 선택 인증 UX)
 * - Bearer 형식 오류 / 위조·변조 토큰 → 401
 */
export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const authorization = req.header("authorization");

  if (!authorization?.trim()) {
    next();
    return;
  }

  try {
    const [scheme, token, ...rest] = authorization.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
      throw new AppError("UNAUTHORIZED", {
        message: "Authorization 헤더 형식이 올바르지 않습니다.",
      });
    }

    const result = verifyAccessTokenOptional(token);

    if (result.status === "expired") {
      next();
      return;
    }

    if (result.status === "invalid") {
      throw new AppError("UNAUTHORIZED", {
        message: "유효하지 않은 Access Token입니다.",
      });
    }

    // 정지 이의 제기 제한 세션은 문의 API 외 일반 서비스 인증에 사용할 수 없다.
    if (result.payload.purpose !== undefined) {
      throw new AppError("UNAUTHORIZED", {
        message: "일반 서비스에 사용할 수 없는 Access Token입니다.",
      });
    }

    // 토큰 발급 후 변경된 정지·탈퇴 상태를 즉시 반영하기 위해 현재 계정 상태를 조회한다.
    const user = await prisma.user.findUnique({
      where: { id: result.payload.userId },
      select: { isActive: true, deletedAt: true },
    });

    if (user && !user.isActive && user.deletedAt === null) {
      throw new AppError("ACCOUNT_SUSPENDED");
    }

    if (!user || user.deletedAt !== null) {
      throw new AppError("FORBIDDEN", {
        message: "비활성화되었거나 탈퇴 처리된 계정입니다.",
      });
    }

    req.user = {
      id: result.payload.userId,
      role: result.payload.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};
