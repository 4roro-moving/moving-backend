import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
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

/**
 * 정적 경로를 :estimateRequestId 보다 먼저 등록해야 합니다.
 */
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

estimateRequestRouter.post(
  "/:estimateRequestId/designate",
  validate({
    params: estimateRequestIdParamSchema,
    body: designateMoverSchema,
  }),
  estimateRequestController.designateMover,
);

export default estimateRequestRouter;
