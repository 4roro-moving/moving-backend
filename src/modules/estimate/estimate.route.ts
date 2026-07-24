import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { estimateController } from "./estimate.controller";
import {
  moverEstimateRequestListQuerySchema,
  sendEstimateBodySchema,
  sendEstimateParamSchema,
} from "./estimate.validator";

const moverEstimateRequestRouter = Router();

moverEstimateRequestRouter.use(authenticate, authorize("MOVER"));
moverEstimateRequestRouter.get(
  "/requests",
  validate({ query: moverEstimateRequestListQuerySchema }),
  estimateController.getList,
);
moverEstimateRequestRouter.post(
  "/requests/:estimateRequestId",
  validate({
    params: sendEstimateParamSchema,
    body: sendEstimateBodySchema,
  }),
  estimateController.sendEstimate,
);

export default moverEstimateRequestRouter;
