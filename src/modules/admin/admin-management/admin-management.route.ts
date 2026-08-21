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
  listAdminQuerySchema,
  updateAdminStatusBodySchema,
} from "./admin-management.validator";

const adminManagementRouter = Router();

adminManagementRouter.use(authenticate, authorize(UserRole.ADMIN), requireActiveAdmin);

adminManagementRouter
  .route("/")
  .get(
    authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_VIEW),
    validate({ query: listAdminQuerySchema }),
    asyncHandler(adminManagementController.getAdminList),
  )
  .post(
    authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_CREATE),
    validate({ body: createAdminBodySchema }),
    asyncHandler(adminManagementController.createAdmin),
  );

adminManagementRouter.route("/:id/status").patch(
  authorizeAdmin(ADMIN_PERMISSIONS.ADMIN_STATUS_MANAGE),
  validate({
    params: adminIdParamSchema,
    body: updateAdminStatusBodySchema,
  }),
  asyncHandler(adminManagementController.updateAdminStatus),
);

export default adminManagementRouter;
