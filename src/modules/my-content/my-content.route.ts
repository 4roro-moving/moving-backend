import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";

import { myContentController } from "./my-content.controller";
import { myContentParamsSchema } from "./my-content.validator";

export const myContentRouter = Router();

myContentRouter.use(authenticate, authorize("CUSTOMER"));

myContentRouter.get(
  "/:contentType/:contentId",
  validate({ params: myContentParamsSchema }),
  asyncHandler(myContentController.getMyContentDetail),
);
