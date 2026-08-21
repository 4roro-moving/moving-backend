import { UserRole } from "@prisma/client";
import { Router } from "express";

import { requireActiveAdmin } from "../../../../middlewares/admin";
import { authenticate, authorize } from "../../../../middlewares/auth";
import { validate } from "../../../../middlewares/validate";
import { asyncHandler } from "../../../../utils/async-handler.util";

import { listMoverQuerySchema, moverIdParamSchema } from "./movers.validator";

import { moversController } from "./movers.controller";
import { updateMemberStatusBodySchema } from "../member-status.validator";

const adminMoverRouter = Router();

adminMoverRouter.use(authenticate, authorize(UserRole.ADMIN), requireActiveAdmin);

adminMoverRouter
  .route("/")
  .get(validate({ query: listMoverQuerySchema }), asyncHandler(moversController.getMoverList));

adminMoverRouter
  .route("/:id")
  .get(validate({ params: moverIdParamSchema }), asyncHandler(moversController.getMoverDetail));

adminMoverRouter
  .route("/:id/status")
  .patch(
    validate({ params: moverIdParamSchema, body: updateMemberStatusBodySchema }),
    asyncHandler(moversController.updateMoverStatus),
  );

export default adminMoverRouter;
