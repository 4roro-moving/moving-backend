import type { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";

/**
 * 개발용 인증.
 *   x-mock-user: customer1@test.com
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new AppError("UNAUTHORIZED");
    }

    const email = req.header("x-mock-user") ?? process.env.MOCK_USER_EMAIL;

    if (!email) {
      throw new AppError("UNAUTHORIZED", {
        message: "x-mock-user 헤더에 시드 계정 이메일을 넣어주세요.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new AppError("UNAUTHORIZED");
    }

    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function authorize(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError("UNAUTHORIZED"));

      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError("FORBIDDEN"));

      return;
    }

    next();
  };
}
