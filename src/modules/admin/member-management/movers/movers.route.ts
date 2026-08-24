import { Router } from "express";

import { ADMIN_PERMISSIONS } from "../../../../lib/auth/admin-permissions";

import { requireActiveAdmin } from "../../../../middlewares/admin";
import { authorizeAdmin } from "../../../../middlewares/admin-auth";
import { authenticate } from "../../../../middlewares/auth";
import { validate } from "../../../../middlewares/validate";
import { asyncHandler } from "../../../../utils/async-handler.util";

import { listMoverQuerySchema, moverIdParamSchema } from "./movers.validator";

import { moversController } from "./movers.controller";
import { updateMemberStatusBodySchema } from "../member-status.validator";

const adminMoverRouter = Router();

adminMoverRouter.use(
  authenticate,
  requireActiveAdmin,
  authorizeAdmin(ADMIN_PERMISSIONS.USER_SUSPEND),
);

adminMoverRouter
  .route("/")
  .get(validate({ query: listMoverQuerySchema }), asyncHandler(moversController.getMoverList));

adminMoverRouter
  .route("/:id")
  .get(validate({ params: moverIdParamSchema }), asyncHandler(moversController.getMoverDetail));

adminMoverRouter.route("/:id/status").patch(
  validate({
    params: moverIdParamSchema,
    body: updateMemberStatusBodySchema,
  }),
  asyncHandler(moversController.updateMoverStatus),
);

export default adminMoverRouter;
