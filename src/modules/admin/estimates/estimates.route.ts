import { UserRole } from "@prisma/client";
import { Router } from "express";

import { requireActiveAdmin } from "../../../middlewares/admin";
import { authenticate, authorize } from "../../../middlewares/auth";
import { validate } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler.util";
import { adminEstimatesController } from "./estimates.controller";
import { adminEstimateIdParamSchema, cancelAdminEstimateBodySchema } from "./estimates.validator";

const adminEstimateRouter = Router();

adminEstimateRouter.use(authenticate, authorize(UserRole.ADMIN), requireActiveAdmin);

adminEstimateRouter.patch(
  "/:estimateId/cancel",
  validate({ params: adminEstimateIdParamSchema, body: cancelAdminEstimateBodySchema }),
  asyncHandler(adminEstimatesController.cancelConfirmedEstimate),
);

export default adminEstimateRouter;
