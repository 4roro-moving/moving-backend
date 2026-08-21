import type { RequestHandler } from "express";

import { AppError } from "../lib/app-error";
import { prisma } from "../lib/prisma";
import type { AdminPermission } from "../lib/auth/admin-permissions";
import { hasAdminPermission } from "../lib/auth/has-admin-permission";

export function authorizeAdmin(permission: AdminPermission): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        throw new AppError("UNAUTHORIZED", {
          message: "인증이 필요합니다.",
        });
      }

      if (req.user.role !== "ADMIN") {
        throw new AppError("FORBIDDEN", {
          message: "관리자만 접근할 수 있습니다.",
        });
      }

      const adminProfile = await prisma.adminProfile.findUnique({
        where: {
          userId: req.user.id,
        },
        select: {
          adminRole: true,
        },
      });

      if (!adminProfile) {
        throw new AppError("FORBIDDEN", {
          message: "관리자 권한 정보를 확인할 수 없습니다.",
        });
      }

      if (!hasAdminPermission(adminProfile.adminRole, permission)) {
        throw new AppError("FORBIDDEN", {
          message: "해당 요청을 수행할 권한이 없습니다.",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
