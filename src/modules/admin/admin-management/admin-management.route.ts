import { UserRole } from "@prisma/client";

import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../../middlewares/admin";

import { authorizeAdmin } from "../../../middlewares/admin-auth";

import { authenticate, authorize } from "../../../middlewares/auth";

import { validate } from "../../../middlewares/validate";

import { asyncHandler } from "../../../utils/async-handler.util";

import { adminManagementController } from "./admin-management.controller";

import {
  adminIdParamSchema,
  createAdminBodySchema,
  deactivateAdminBodySchema,
  listAdminQuerySchema,
  updateAdminStatusBodySchema,
} from "./admin-management.validator";

const adminManagementRouter = Router();

/**
 * 관리자 계정 관리 API 공통 인증/인가
 *
 * 1. authenticate
 *    - Access Token을 검증하고 req.user를 설정합니다.
 *
 * 2. authorize(UserRole.ADMIN)
 *    - User.role이 ADMIN인지 확인합니다.
 *
 * 3. requireActiveAdmin
 *    - DB의 관리자 계정 상태를 다시 확인합니다.
 *    - 정지되거나 비활성화된 관리자는
 *      Access Token이 아직 유효하더라도 접근할 수 없습니다.
 *
 * 이후 각 API에서는 authorizeAdmin()을 통해
 * 세부 관리자 권한(Permission)을 추가로 검증합니다.
 */
adminManagementRouter.use(authenticate, authorize(UserRole.ADMIN), requireActiveAdmin);

/**
 * GET /api/admin/admins
 *
 * 일반 ADMIN 목록 조회
 *
 * - SUPER_ADMIN만 조회할 수 있습니다.
 * - 일반 ADMIN은 ADMIN_VIEW 권한이 없어 접근할 수 없습니다.
 * - keyword, status, page, limit Query를 검증합니다.
 */
adminManagementRouter
  .route("/")
  .get(
    authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_VIEW),
    validate({ query: listAdminQuerySchema }),
    asyncHandler(adminManagementController.getAdminList),
  )

  /**
   * POST /api/admin/admins
   *
   * 일반 ADMIN 계정 생성
   *
   * - SUPER_ADMIN만 생성할 수 있습니다.
   * - role / adminRole은 요청으로 받지 않고
   *   서버에서 ADMIN으로 고정합니다.
   */
  .post(
    authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_CREATE),
    validate({ body: createAdminBodySchema }),
    asyncHandler(adminManagementController.createAdmin),
  );

/**
 * GET /api/admin/admins/:id
 *
 * 일반 ADMIN 상세 조회
 *
 * - SUPER_ADMIN만 조회할 수 있습니다.
 * - 관리자 UUID Path Parameter를 검증합니다.
 * - 상세 조회 대상은 AdminRole.ADMIN인 일반 관리자입니다.
 * - SUPER_ADMIN은 일반 관리자 관리 대상에서 제외됩니다.
 */
adminManagementRouter
  .route("/:id")
  .get(
    authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_VIEW),
    validate({ params: adminIdParamSchema }),
    asyncHandler(adminManagementController.getAdminDetail),
  );

/**
 * PATCH /api/admin/admins/:id/status
 *
 * 일반 ADMIN 계정 정지/해제
 *
 * - SUPER_ADMIN만 수행할 수 있습니다.
 * - SUSPEND / RELEASE 요청을 처리합니다.
 * - 대상 관리자 ID와 요청 Body를 모두 검증합니다.
 * - SUPER_ADMIN 계정 자체는 Service에서 상태 변경을 차단합니다.
 * - 비활성화된 관리자는 정지/해제할 수 없습니다.
 */
adminManagementRouter.route("/:id/status").patch(
  authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_STATUS_MANAGE),
  validate({
    params: adminIdParamSchema,
    body: updateAdminStatusBodySchema,
  }),
  asyncHandler(adminManagementController.updateAdminStatus),
);

/**
 * PATCH /api/admin/admins/:id/deactivate
 *
 * 일반 ADMIN 계정 비활성화
 *
 * - SUPER_ADMIN만 수행할 수 있습니다.
 * - 대상 관리자 ID와 비활성화 사유를 검증합니다.
 * - 일반 ADMIN(AdminRole.ADMIN)만 비활성화할 수 있습니다.
 * - SUPER_ADMIN 계정 자체는 비활성화할 수 없습니다.
 * - 비활성화 시 User.isActive를 false로 변경합니다.
 * - deletedAt을 기록하여 일반적인 정지 상태와 구분합니다.
 * - 기존 ADMIN Refresh Token 세션을 모두 강제 폐기합니다.
 * - 비활성화 행위와 사유는 ActivityLog에 기록합니다.
 * - 이미 비활성화된 계정의 중복 요청은 Service에서 차단합니다.
 */
adminManagementRouter.route("/:id/deactivate").patch(
  authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_DEACTIVATE),
  validate({
    params: adminIdParamSchema,
    body: deactivateAdminBodySchema,
  }),
  asyncHandler(adminManagementController.deactivateAdmin),
);

export default adminManagementRouter;
