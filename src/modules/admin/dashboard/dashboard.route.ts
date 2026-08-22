import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../../middlewares/admin";

import { authorizeAdmin } from "../../../middlewares/admin-auth";

import { authenticate } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";

import { dashboardController } from "./dashboard.controller";
import { dashboardQuerySchema } from "./dashboard.validator";

/**
 * 관리자 대시보드
 * basePath: /api/admin/dashboard
 *
 * SUPER_ADMIN 은 관리자 계정 관리 전담이라 서비스 운영 지표에 접근하지 않는다.
 * 따라서 ADMIN 만 가진 DASHBOARD_VIEW 권한으로 제한한다.
 */
const adminDashboardRouter = Router();

adminDashboardRouter.use(
  authenticate,
  requireActiveAdmin,
  authorizeAdmin(ADMIN_PERMISSIONS.DASHBOARD_VIEW),
);

adminDashboardRouter
  .route("/")
  .get(validate({ query: dashboardQuerySchema }), asyncHandler(dashboardController.getDashboard));

export { adminDashboardRouter };
