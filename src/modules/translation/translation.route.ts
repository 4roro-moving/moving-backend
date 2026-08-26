import { Router } from "express";

import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { translationController } from "./translation.controller";
import { translateSchema } from "./translation.validator";

const translationRouter = Router();

translationRouter.post(
  "/",
  validate({ body: translateSchema }),
  asyncHandler(translationController.translate),
);

export { translationRouter };
