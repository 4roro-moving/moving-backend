import type { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../lib/app-error";
import { verifyAccessToken } from "../utils/jwt";

export const authenticate: RequestHandler = (req, _res, next) => {
  try {
    const authorization = req.header("authorization");

    if (!authorization) {
      throw new AppError("UNAUTHORIZED", {
        message: "Access Token이 필요합니다.",
      });
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new AppError("UNAUTHORIZED", {
        message: "Authorization 헤더 형식이 올바르지 않습니다.",
      });
    }

    const payload = verifyAccessToken(token);

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
