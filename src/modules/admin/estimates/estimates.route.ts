import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../../middlewares/admin";
import { authorizeAdmin } from "../../../middlewares/admin-auth";
import { authenticate } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";
import { adminEstimatesController } from "./estimates.controller";
import { adminEstimateIdParamSchema, cancelAdminEstimateBodySchema } from "./estimates.validator";

const adminEstimateRouter = Router();

adminEstimateRouter.use(
  authenticate,
  requireActiveAdmin,
  authorizeAdmin(ADMIN_PERMISSIONS.ESTIMATE_MANAGE),
);

adminEstimateRouter.patch(
  "/:estimateId/cancel",
  validate({ params: adminEstimateIdParamSchema, body: cancelAdminEstimateBodySchema }),
  asyncHandler(adminEstimatesController.cancelConfirmedEstimate),
);

export default adminEstimateRouter;
