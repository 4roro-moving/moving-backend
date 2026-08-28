import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../../../middlewares/admin";
import { authorizeAdmin } from "../../../../middlewares/admin-auth";
import { authenticate } from "../../../../middlewares/auth";
import { validate } from "../../../../middlewares/validate";
import { asyncHandler } from "../../../../utils/async-handler.util";

import { updateMemberStatusBodySchema } from "../member-status.validator";

import { customersController } from "./customers.controller";
import { customerIdParamSchema, listCustomerQuerySchema } from "./customers.validator";

const adminCustomerRouter = Router();

adminCustomerRouter.use(
  authenticate,
  requireActiveAdmin,
  authorizeAdmin(ADMIN_PERMISSIONS.USER_SUSPEND),
);

adminCustomerRouter
  .route("/")
  .get(
    validate({ query: listCustomerQuerySchema }),
    asyncHandler(customersController.getCustomerList),
  );

adminCustomerRouter
  .route("/:id")
  .get(
    validate({ params: customerIdParamSchema }),
    asyncHandler(customersController.getCustomerDetail),
  );

adminCustomerRouter
  .route("/:id/status")
  .patch(
    validate({ params: customerIdParamSchema, body: updateMemberStatusBodySchema }),
    asyncHandler(customersController.updateCustomerStatus),
  );

export default adminCustomerRouter;
