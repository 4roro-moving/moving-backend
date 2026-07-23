import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { estimateController } from "./estimate.controller";
import { moverEstimateRequestListQuerySchema } from "./estimate.validator";

const moverEstimateRequestRouter = Router();

moverEstimateRequestRouter.use(authenticate, authorize("MOVER"));
moverEstimateRequestRouter.get(
  "/requests",
  validate({ query: moverEstimateRequestListQuerySchema }),
  estimateController.getList,
);

export default moverEstimateRequestRouter;
