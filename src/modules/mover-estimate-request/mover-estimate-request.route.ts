import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { moverEstimateRequestController } from "./mover-estimate-request.controller";
import { moverEstimateRequestListQuerySchema } from "./mover-estimate-request.validator";

const moverEstimateRequestRouter = Router();

moverEstimateRequestRouter.use(authenticate, authorize("MOVER"));
moverEstimateRequestRouter.get(
  "/",
  validate({ query: moverEstimateRequestListQuerySchema }),
  moverEstimateRequestController.getList,
);

export default moverEstimateRequestRouter;
