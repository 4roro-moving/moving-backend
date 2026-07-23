import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { estimateController } from "../estimate/estimate.controller";
import { receivedEstimateRequestIdParamSchema } from "../estimate/estimate.validator";
import { estimateRequestController } from "./estimateRequest.controller";
import {
  createEstimateRequestSchema,
  designateMoverSchema,
  estimateRequestIdParamSchema,
  listEstimateRequestQuerySchema,
  updateEstimateRequestSchema,
} from "./estimateRequest.validator";

const estimateRequestRouter = Router();

estimateRequestRouter.use(authenticate, authorize("CUSTOMER"));

estimateRequestRouter.get("/active", estimateRequestController.getActiveEstimateRequest);

estimateRequestRouter
  .route("/")
  .post(
    validate({ body: createEstimateRequestSchema }),
    estimateRequestController.createEstimateRequest,
  )
  .get(
    validate({ query: listEstimateRequestQuerySchema }),
    estimateRequestController.getMyEstimateRequestList,
  );

estimateRequestRouter
  .route("/:estimateRequestId")
  .get(
    validate({ params: estimateRequestIdParamSchema }),
    estimateRequestController.getEstimateRequestById,
  )
  .patch(
    validate({
      params: estimateRequestIdParamSchema,
      body: updateEstimateRequestSchema,
    }),
    estimateRequestController.updateEstimateRequest,
  )
  .delete(
    validate({ params: estimateRequestIdParamSchema }),
    estimateRequestController.cancelEstimateRequest,
  );

estimateRequestRouter.get(
  "/:estimateRequestId/estimates",
  validate({ params: receivedEstimateRequestIdParamSchema }),
  estimateController.getReceivedEstimateList,
);

estimateRequestRouter.post(
  "/:estimateRequestId/designate",
  validate({
    params: estimateRequestIdParamSchema,
    body: designateMoverSchema,
  }),
  estimateRequestController.designateMover,
);

export default estimateRequestRouter;
