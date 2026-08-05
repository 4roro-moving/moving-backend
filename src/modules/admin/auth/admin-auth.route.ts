import { UserRole } from "@prisma/client";
import { Router } from "express";

import { requireActiveAdmin } from "../../../middlewares/admin";
import { authenticate, authorize } from "../../../middlewares/auth";
import { csrfProtection } from "../../../middlewares/csrf.middleware";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";

import { adminAuthController } from "./admin-auth.controller";
import { adminAuthValidator } from "./admin-auth.validator";

const adminAuthRouter = Router();

/**
 * 관리자 로그인
 *
 * POST /api/admin/auth/login
 */
adminAuthRouter.post(
  "/login",
  validate({
    body: adminAuthValidator.login,
  }),
  asyncHandler(adminAuthController.login),
);

/**
 * 관리자 Access Token 및 Refresh Token 재발급
 *
 * POST /api/admin/auth/refresh
 */
adminAuthRouter.post("/refresh", csrfProtection, asyncHandler(adminAuthController.refresh));

/**
 * 관리자 로그아웃
 *
 * POST /api/admin/auth/logout
 */
adminAuthRouter.post("/logout", csrfProtection, asyncHandler(adminAuthController.logout));

/**
 * 현재 로그인한 관리자 정보 조회
 *
 * GET /api/admin/auth/me
 */
adminAuthRouter.get(
  "/me",
  authenticate,
  authorize(UserRole.ADMIN),
  requireActiveAdmin,
  asyncHandler(adminAuthController.getCurrentAdmin),
);

export { adminAuthRouter };
