import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../../middlewares/auth";
import { requireActiveAdmin } from "../../../middlewares/admin";
import { csrfProtection } from "../../../middlewares/csrf.middleware";
import { validate } from "../../../middlewares/validate";

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
  adminAuthController.login,
);

/**
 * 관리자 Access Token 및 Refresh Token 재발급
 *
 * Refresh Token은 adminRefreshToken HttpOnly Cookie에서 조회한다.
 */
adminAuthRouter.post("/refresh", csrfProtection, adminAuthController.refresh);

/**
 * 관리자 로그아웃
 *
 * Refresh Token은 adminRefreshToken HttpOnly Cookie에서 조회한다.
 */
adminAuthRouter.post("/logout", csrfProtection, adminAuthController.logout);

/**
 * 현재 로그인한 관리자 정보 조회
 */
adminAuthRouter.get(
  "/me",
  authenticate,
  authorize(UserRole.ADMIN),
  requireActiveAdmin,
  adminAuthController.getCurrentAdmin,
);

export { adminAuthRouter };
