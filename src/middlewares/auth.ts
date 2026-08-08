import type { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../lib/app-error";
import { prisma } from "../lib/prisma";
import { verifyAccessToken, verifyAccessTokenOptional } from "../utils/jwt";

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

/**
 * 비회원 조회 허용 + 유효 토큰이면 req.user 설정.
 * - 헤더 없음 → 비회원
 * - Access Token 만료 → 비회원 (목록 등 선택 인증 UX)
 * - Bearer 형식 오류 / 위조·변조 토큰 → 401
 */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
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

    req.user = {
      id: result.payload.userId,
      role: result.payload.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};
