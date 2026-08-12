import { UserRole } from "@prisma/client";
import { Router } from "express";

import { requireActiveAdmin } from "../../../../middlewares/admin";
import { authenticate, authorize } from "../../../../middlewares/auth";
import { validate } from "../../../../middlewares/validate";
import { asyncHandler } from "../../../../utils/async-handler.util";
import { moversController } from "./movers.controller";
import { listMoverQuerySchema } from "./movers.validator";

const adminMoverRouter = Router();

adminMoverRouter.use(authenticate, authorize(UserRole.ADMIN), requireActiveAdmin);

adminMoverRouter
  .route("/")
  .get(validate({ query: listMoverQuerySchema }), asyncHandler(moversController.getMoverList));

export default adminMoverRouter;
