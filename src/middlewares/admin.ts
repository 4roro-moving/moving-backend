import { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../lib/app-error";
import { adminAuthRepository } from "../modules/admin/auth/admin-auth.repository";

/**
 * 활성 관리자 계정인지 확인한다.
 *
 * Access Token이 아직 만료되지 않았더라도
 * DB의 isActive 및 deletedAt 상태를 확인하여
 * 비활성화된 관리자의 접근을 즉시 차단한다.
 *
 * 조회한 관리자 정보는 req.admin에 저장하여
 * 이후 Controller에서 같은 사용자를 다시 조회하지 않도록 한다.
 */
export const requireActiveAdmin: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user) {
      return next(
        new AppError("UNAUTHORIZED", {
          message: "인증이 필요합니다.",
        }),
      );
    }

    if (req.user.role !== UserRole.ADMIN) {
      return next(
        new AppError("FORBIDDEN", {
          message: "관리자 권한이 필요합니다.",
        }),
      );
    }

    const admin = await adminAuthRepository.findByIdForSession(req.user.id);

    if (!admin) {
      return next(
        new AppError("UNAUTHORIZED", {
          message: "관리자 계정을 확인할 수 없습니다.",
        }),
      );
    }

    if (!admin.isActive || admin.deletedAt !== null) {
      return next(
        new AppError("FORBIDDEN", {
          message: "비활성화된 관리자 계정입니다.",
        }),
      );
    }

    req.admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
