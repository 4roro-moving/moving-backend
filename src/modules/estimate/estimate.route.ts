import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { moverEstimateRequestController } from "./estimate.controller";
import { moverEstimateRequestListQuerySchema } from "./estimate.validator";

const moverEstimateRequestRouter = Router();

moverEstimateRequestRouter.use(authenticate, authorize("MOVER"));
moverEstimateRequestRouter.get(
  "/",
  validate({ query: moverEstimateRequestListQuerySchema }),
  moverEstimateRequestController.getList,
);

export default moverEstimateRequestRouter;
